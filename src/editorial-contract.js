// Pure public contracts; no private state is accepted by these serializers.
export const SLOTS = ['philosophy','books','future'];
export const LABELS = ['Pensiero del mattino','Biblioteca di idee','Radar del futuro'];
export const REASONS = {topic:'argomento non interessante',too_long:'troppo lungo',too_short:'troppo corto',shallow:'superficiale',verbose:'verboso',technical:'troppo tecnico',style:'stile non gradito',more:'vorrei più contenuti simili'};
export const validId = x => typeof x==='string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(x);
export function validDate(x) { return typeof x==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x; }
export function safeUrl(x) { try {const u=new URL(x);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;} }
export const wordCount = a => a.sections.flatMap(s=>s.paragraphs).join(' ').trim().split(/\s+/u).filter(Boolean).length;
export function validateEdition(e) {
 if(!e||e.schema!==1||!validDate(e.date)||!Number.isFinite(Date.parse(e.updated_at))||!Array.isArray(e.articles)||e.articles.length!==3)throw Error('Edizione non valida');
 const ids=new Set();
 e.articles.forEach((a,i)=>{
  if(!a||a.slot!==SLOTS[i]||!validId(a.id)||ids.has(a.id)||typeof a.title!=='string'||!a.title.trim()||a.title.length>160||!['original','synthesis','evergreen','news','reduced'].includes(a.kind)||typeof a.basis!=='string'||!a.basis.trim())throw Error('Articolo non valido');
  ids.add(a.id);
  if(!Array.isArray(a.sections)||!a.sections.length||a.sections.length>40||a.sections.some(s=>typeof s.heading!=='string'||!Array.isArray(s.paragraphs)||!s.paragraphs.length||s.paragraphs.some(p=>typeof p!=='string'||!p.trim()||p.length>12000)))throw Error('Testo non valido');
  if(!Array.isArray(a.sources)||!a.sources.length||a.sources.some(s=>typeof s.title!=='string'||!s.title||!safeUrl(s.url)||!validDate(s.accessed)||typeof s.edition!=='string'))throw Error('Fonti non valide');
  if(a.kind==='news'&&(!validDate(a.event_date)||!validDate(a.publication_date)))throw Error('Date notizia mancanti');
  const n=wordCount(a), [min,max]=[[500,800],[2200,3200],[1200,2000]][i];
  if(n<(a.kind==='reduced'?150:min)||n>max)throw Error(`Lunghezza ${a.slot}: ${n}`);
 });return e;
}
export function sensitiveComment(x) {return /(?:gh[pousr]_[\w]{15,}|github_pat_|sk-[\w-]{12,}|Bearer\s+\S+|-----BEGIN|password\s*[:=]|token\s*[:=]|\b(?:pcos|insulina|contraccettiv\w*|mestru\w*|sanguin\w*|diagnos\w*|farmac\w*|salute|malatt\w*|giordana|fidanzat\w*|relazione|coppia)\b)/iu.test(x);}
export function validateRating(x) {
 if(!x||!validId(x.article_id)||!Number.isInteger(x.score)||x.score<0||x.score>3||!Array.isArray(x.reasons)||x.reasons.length>8||x.reasons.some(r=>!Object.hasOwn(REASONS,r))||!Number.isSafeInteger(x.revision)||x.revision<=0||!Number.isFinite(Date.parse(x.rated_at)))throw Error('Voto non valido');
 const comment=typeof x.comment==='string'?x.comment.trim():'';
 if(comment.length>500||sensitiveComment(comment))throw Error('Rimuovi dati personali, sanitari o credenziali dal commento pubblico');
 return {article_id:x.article_id,score:x.score,reasons:[...new Set(x.reasons)].sort(),comment,rated_at:new Date(x.rated_at).toISOString(),revision:x.revision};
}
