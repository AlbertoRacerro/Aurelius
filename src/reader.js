export const READER_KEY='aurelius.reader.v1';
export function readerPreferences(storage){
 let p={};try{p=JSON.parse(storage.getItem(READER_KEY)||'{}')||{};}catch{}
 return {theme:['paper','mist','night'].includes(p.theme)?p.theme:'paper',font:p.font==='sans'?'sans':'serif',size:[18,20,22,24,28].includes(Number(p.size))?Number(p.size):20};
}
export function applyReaderPreferences(storage){
 const p=readerPreferences(storage),root=document.documentElement;
 root.dataset.readerTheme=p.theme;root.dataset.readerFont=p.font;root.style.setProperty('--reader-size',p.size+'px');
 return p;
}
export function saveReaderPreferences(storage,patch){
 const next={...readerPreferences(storage),...patch};
 storage.setItem(READER_KEY,JSON.stringify(next));return applyReaderPreferences(storage);
}
export function readerControls(storage){
 const p=readerPreferences(storage);
 const options=(values,key)=>values.map(([id,label])=>`<option value="${id}"${String(p[key])===String(id)?' selected':''}>${label}</option>`).join('');
 return `<details class="reader-options"><summary>Aspetto della lettura</summary><div class="reader-fields"><label>Tema<select data-reader="theme">${options([['paper','Carta'],['mist','Grigio'],['night','Sera']],'theme')}</select></label><label>Carattere<select data-reader="font">${options([['serif','Georgia'],['sans','Sistema']],'font')}</select></label><label>Dimensione<select data-reader="size">${options([18,20,22,24,28].map(n=>[n,n+' px']),'size')}</select></label></div><button class="btn sm" data-act="reader-reset">Ripristina lettura</button></details>`;
}
