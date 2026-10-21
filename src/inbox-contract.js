// Shared allowlist. AI output is data, never executable code or a whole-state replacement.
export const NOTE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const obj = x => x && typeof x === 'object' && !Array.isArray(x);
const fields = (x, keys) => { if (!obj(x) || Object.keys(x).some(k => !keys.includes(k))) throw Error('Campi non consentiti'); };
const text = (x, max) => { if (typeof x !== 'string' || !x.trim() || x.length > max) throw Error('Testo non valido'); return x.trim(); };
const date = x => /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x)) && new Date(x+'T00:00:00Z').toISOString().slice(0,10) === x;
export function validateNote(x) {
 fields(x,['schema','id','text','created_at','timezone']);
 if(x.schema!==1 || !NOTE_ID.test(x.id) || x.timezone!=='Europe/Rome' || !Number.isSafeInteger(x.created_at) || x.created_at<1)throw Error('Nota non valida');
 return {schema:1,id:x.id,text:text(x.text,4000),created_at:x.created_at,timezone:x.timezone};
}
export function validateResult(x, expectedId) {
 fields(x,['schema','note_id','summary','operations']);
 if(x.schema!==1 || !NOTE_ID.test(x.note_id) || x.note_id!==expectedId || !Array.isArray(x.operations) || !x.operations.length || x.operations.length>20)throw Error('Risultato non valido');
 const summary=text(x.summary,400), ids=new Set();
 const operations=x.operations.map(o=>{
  fields(o,['id','type','text','list','due','remind_at']);
  if(!/^[a-z0-9_-]{1,40}$/.test(o.id) || ids.has(o.id) || !['task','list','idea','proposal','clarify'].includes(o.type))throw Error('Operazione non consentita');
  ids.add(o.id);const v={id:o.id,type:o.type,text:text(o.text,300)};
  if(o.type==='list')v.list=text(o.list,60);else if(o.list!==undefined)throw Error('Lista non consentita');
  if(o.due!==undefined){if(o.type!=='task'||!date(o.due))throw Error('Scadenza non valida');v.due=o.due;}
  if(o.remind_at!==undefined){if(o.type!=='task'||!Number.isSafeInteger(o.remind_at)||o.remind_at<1||o.remind_at>4102444800000)throw Error('Promemoria non valido');v.remind_at=o.remind_at;}
  return v;
 });
 return {schema:1,note_id:x.note_id,summary,operations};
}
