import {NextRequest,NextResponse} from "next/server";
import {getWhatsAppAdminClient} from "@/lib/whatsapp/admin";
import {buildWelcomeMessage,classifyInboundText,isFinancialAdviceRequest,nextRetryAt,routeForService} from "@/lib/whatsapp/domain";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const BATCH=50;
async function queueReply(db:any,conversationId:string,to:string,body:string){
 const {error}=await db.from("whatsapp_outbox").insert({conversation_id:conversationId,recipient_wa_id:to,body,message_type:"text"});
 if(error)throw error;
}
async function inbound(db:any,event:any){
 const {message,contact:metaContact}=event.payload??{};
 if(!message?.id||!message?.from)return;
 const waId=String(message.from),body=message.type==="text"?message.text?.body??"":"";
 const now=new Date();
 const c=await db.from("whatsapp_contacts").upsert({wa_id:waId,phone_e164:waId.startsWith("+")?waId:"+"+waId,display_name:metaContact?.profile?.name??null,updated_at:now.toISOString()},{onConflict:"wa_id"}).select("id,opted_out_at").single();
 if(c.error||!c.data)throw c.error??new Error("Contact upsert failed");
 let q=await db.from("whatsapp_conversations").select("id,status,bot_enabled").eq("contact_id",c.data.id).in("status",["open","handed_off"]).order("updated_at",{ascending:false}).limit(1).maybeSingle();
 if(q.error)throw q.error;
 if(!q.data){q=await db.from("whatsapp_conversations").insert({contact_id:c.data.id,status:"open",bot_enabled:true}).select("id,status,bot_enabled").single();if(q.error||!q.data)throw q.error??new Error("Conversation create failed")}
 const conv=q.data;
 const m=await db.from("whatsapp_messages").upsert({conversation_id:conv.id,wa_message_id:message.id,direction:"inbound",message_type:message.type??"unknown",body:body||"["+String(message.type??"unsupported")+" message]",delivery_status:"received",raw_payload:message},{onConflict:"wa_message_id",ignoreDuplicates:true});
 if(m.error)throw m.error;
 await db.from("whatsapp_conversations").update({last_message_at:now.toISOString(),service_window_expires_at:new Date(now.getTime()+86400000).toISOString(),updated_at:now.toISOString()}).eq("id",conv.id);
 const intent=classifyInboundText(body);
 if(intent==="opt_out"){
  await db.from("whatsapp_contacts").update({opted_out_at:now.toISOString()}).eq("id",c.data.id);
  await db.from("whatsapp_conversations").update({bot_enabled:false,status:"handed_off"}).eq("id",conv.id);
  return queueReply(db,conv.id,waId,"You have been opted out of automated WhatsApp messages. We will not send promotional messages.");
 }
 if(c.data.opted_out_at)return;
 if(intent==="human_handoff"){
  await db.from("whatsapp_conversations").update({bot_enabled:false,status:"handed_off"}).eq("id",conv.id);
  return queueReply(db,conv.id,waId,"Thank you. Your conversation has been handed to our WeLanterns team. A team member will respond during business hours.");
 }
 if(!conv.bot_enabled||conv.status==="handed_off")return;
 if(isFinancialAdviceRequest(body)){
  await db.from("whatsapp_conversations").update({bot_enabled:false,status:"handed_off"}).eq("id",conv.id);
  return queueReply(db,conv.id,waId,"For your protection, automated systems cannot provide personalized investment recommendations or trading signals. I have referred your query to our team. Never share OTPs, passwords or bank PINs.");
 }
 const selection=routeForService(body);
 if(selection){
  await db.from("whatsapp_bot_sessions").upsert({conversation_id:conv.id,current_step:"qualification",context:selection,updated_at:now.toISOString()},{onConflict:"conversation_id"});
  await db.from("whatsapp_lead_intakes").insert({contact_id:c.data.id,conversation_id:conv.id,vertical:selection.vertical,product:selection.product,status:"new"});
  return queueReply(db,conv.id,waId,"Thank you for your interest in "+selection.product+". Please share your name and a short description of what you need. Reply 8 anytime to speak with a person.");
 }
 const s=await db.from("whatsapp_bot_sessions").select("current_step").eq("conversation_id",conv.id).maybeSingle();
 if(s.data?.current_step==="qualification"){
  const intake=await db.from("whatsapp_lead_intakes").select("id").eq("conversation_id",conv.id).eq("status","new").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(intake.data){await db.from("whatsapp_lead_intakes").update({requirement:body,updated_at:now.toISOString()}).eq("id",intake.data.id);await db.from("whatsapp_bot_sessions").update({current_step:"done",updated_at:now.toISOString()}).eq("conversation_id",conv.id);return queueReply(db,conv.id,waId,"Thank you. Your enquiry has been recorded. Please share your preferred callback time, or reply 8 to request a team member.")}
 }
 return queueReply(db,conv.id,waId,buildWelcomeMessage());
}
async function send(db:any,item:any){
 const token=process.env.WHATSAPP_ACCESS_TOKEN,phone=process.env.WHATSAPP_PHONE_NUMBER_ID,version=process.env.WHATSAPP_API_VERSION;
 if(!token||!phone||!version)throw new Error("Meta Cloud API credentials are not configured");
 const r=await fetch("https://graph.facebook.com/"+version+"/"+phone+"/messages",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to:item.recipient_wa_id,type:"text",text:{preview_url:false,body:item.body}}),cache:"no-store"});
 const data:any=await r.json().catch(()=>({}));
 if(!r.ok){const permanent=r.status>=400&&r.status<500&&![408,429].includes(r.status);await db.from("whatsapp_outbox").update({status:permanent?"failed":"pending",last_error:"Meta API HTTP "+r.status,next_attempt_at:nextRetryAt(item.attempts),locked_at:null,updated_at:new Date().toISOString()}).eq("id",item.id);return false}
 const waId=data?.messages?.[0]?.id??null;
 await db.from("whatsapp_outbox").update({status:"sent",wa_message_id:waId,locked_at:null,updated_at:new Date().toISOString()}).eq("id",item.id);
 await db.from("whatsapp_messages").insert({conversation_id:item.conversation_id,wa_message_id:waId,direction:"outbound",message_type:"text",body:item.body,delivery_status:"sent"});
 return true;
}
export async function POST(req:NextRequest){
 const secret=process.env.WHATSAPP_WORKER_SECRET;
 if(!secret||req.headers.get("authorization")!=="Bearer "+secret)return NextResponse.json({error:"Unauthorized"},{status:401});
 const db=getWhatsAppAdminClient(),claim=await db.rpc("claim_whatsapp_events",{batch_size:BATCH});
 if(claim.error)return NextResponse.json({error:"Event queue unavailable"},{status:500});
 let processed=0,failed=0;
 for(const event of claim.data??[]){
  try{
   if(event.event_type==="status"){const p=event.payload??{};await db.from("whatsapp_messages").update({delivery_status:p.status}).eq("wa_message_id",p.id)}
   else await inbound(db,event);
   await db.from("whatsapp_webhook_events").update({status:"processed",processed_at:new Date().toISOString(),locked_at:null}).eq("id",event.id);processed++;
  }catch(e){failed++;await db.from("whatsapp_webhook_events").update({status:event.attempts>=8?"failed":"pending",error_text:e instanceof Error?e.message:"Processing failed",next_attempt_at:nextRetryAt(event.attempts),locked_at:null,updated_at:new Date().toISOString()}).eq("id",event.id)}
 }
 const out=await db.rpc("claim_whatsapp_outbox",{batch_size:BATCH});
 if(out.error)return NextResponse.json({processed,failed,error:"Outbox queue unavailable"},{status:500});
 let sent=0;
 for(const item of out.data??[]){try{if(await send(db,item))sent++}catch(e){await db.from("whatsapp_outbox").update({status:item.attempts>=8?"failed":"pending",last_error:e instanceof Error?e.message:"Send failed",next_attempt_at:nextRetryAt(item.attempts),locked_at:null,updated_at:new Date().toISOString()}).eq("id",item.id)}}
 return NextResponse.json({claimed:(claim.data??[]).length,processed,failed,outboxClaimed:(out.data??[]).length,sent});
}