# Operazioni editoriali 2.6

## Architettura e confini

PWA statica esistente; stessi schema 2, chiavi calendario, timer, storico e relazione locale. La bacheca contiene tre articoli incorporati in un JSON atomico. `manifest.json` cambia insieme all'edizione; nuove pubblicazioni non richiedono modifiche ai moduli JS. Produzione: lettura da GitHub raw, fallback cache locale e prima edizione inclusa nella shell. Test locale: directory `content/`. Cache limitata a sette edizioni; ieri resta datato se oggi non arriva. Non esistono arretrati di lettura.

Il repository separato `Aurelius-Content` non è stato creato: l'accesso in lettura restituisce 404 e il connettore non espone creazione repository. Fallback esplicito: `content/` nel repository pubblico esistente. Quando disponibile un nuovo repo, copiare solo la directory, cambiare `CONTENT_BASE`, e indirizzare Worker/automazione al nuovo target. Non copiare backup o la specifica privata completa.

Feedback fuori dallo stato principale: `aurelius.feedback.local.v1` e `aurelius.editorial.auth.v1`. Non richiede push. Token proprietario lungo, distribuito privatamente al dispositivo e custodito come secret `FEEDBACK_TOKEN` sul Worker. Nessun endpoint pubblico di enrollment. CORS non è autenticazione. Limite 30 richieste autenticate/minuto; una riga D1 per articolo; revisione monotona, retry idempotente, conflitto 409 se un altro dispositivo ha già un voto più recente. L'utente può modificare il voto per sostituirlo. La UI distingue locale, D1 e GitHub e non dichiara pubblicazione prima della conferma.

Il cron esistente mantiene le push, e separatamente prova la pubblicazione dei voti in batch. Lease D1 e SHA GitHub proteggono le scritture; tre tentativi su conflitto, coda conservata se il provider fallisce. Il JSON pubblico contiene solo article_id, score, reasons, comment, rated_at; niente token, presenza o stato privato. Il filtro sul commento impedisce comuni credenziali e termini sensibili, ma non può garantire di riconoscere ogni informazione personale formulata liberamente: la UI spiega la pubblicità persistente e offre invio senza testo.

## Accesso Cloudflare necessario

`wrangler whoami` nell'ambiente iniziale ha risposto non autenticato. Nessuna migrazione remota, secret o deploy Worker è stata eseguita. Non usare `worker/deploy.sh` per questo upgrade: può generare nuove chiavi VAPID su un ambiente nuovo. Usare `worker/upgrade-editorial.sh`, che preserva VAPID, ENROLL_KEY, dispositivi e reminder.

Dopo accesso all'account Cloudflare esistente, provisionare privatamente:
- `FEEDBACK_TOKEN`: almeno 32 caratteri URL-safe casuali; stesso codice nel lettore proprietario. Mai GitHub o chat pubblica.
- `GITHUB_EDITORIAL_TOKEN`: fine-grained token con contents:write sul solo repository target. Non inviarlo al frontend.

I segreti si inseriscono con `wrangler secret put` dall'account autorizzato. Quindi eseguire lo script di upgrade: test, validazione, migrazione additiva `0002_editorial.sql`, deploy. Le variabili non segrete del target sono in wrangler.toml. L'app continua a conservare i voti localmente se l'endpoint non è configurato; la vecchia versione Worker risponde 404 e la UI mantiene l'errore.

## Automazioni e limiti operativi

Prompt completo: `EDITORIAL_AUTOMATION.md`. La task ChatGPT legge policy e feedback, ricerca e prepara tre testi, apre PR, verifica e pubblica. La creazione della task conferma soltanto la pianificazione: non prova che una futura esecuzione disponga di tutti gli strumenti o finisca prima delle 07:00. Conservare stato ed eventuale ID reale nel rapporto di rilascio.

GitHub Actions: validazione su PR/push; riserva alle 03:31 UTC (05:31 estate, 04:31 inverno) o avvio manuale. Pubblica soltanto un'edizione pronta della data Rome: nessun generatore dimostrativo spacciato per redazione. Il commit è unico; un push concorrente fa fallire il job senza sovrascrivere dati. Nessuna API a pagamento. Job schedulati possono ritardare: nessuna garanzia di orario esatto.

Idee: JSON e import locale con unione per ID, 47 idee iniziali. Punteggio zero disabilita una proposta, non elimina il record. Spesa: checked=in casa; import unisce senza cambiare voci esistenti. Metadata calendario `context: shopping`, scelto dall'editor, mai dedotto con regex dalla nota. Pianifica apre l'editor senza salvare automaticamente. Nudge nelle pause reali o prima di spesa, esclusi conflitti con lezioni/studio, più proposte distinte al giorno e toggle dedicato. Gli intervalli sono una rotazione riproducibile per data, non una telemetria di avvenuta consegna. Nessun arretrato o KPI delle idee. Co-presenza futura non inferita; vecchie 40 attenzioni preservate. Le pause dopo Pomodoro sono offerte dal link nella sessione conclusa, senza cambiare durata del timer.

Restano future: archivio ricercabile, modifica vocale calendario, riserva reale di trenta articoli e raccomandazione statistica avanzata. I controlli semantici editoriali richiedono la ricerca e la revisione del redattore, non si ricavano dal solo passaggio dello schema.

## Verifica di questa consegna

- Baseline remoto ispezionato: `f08a4d0`, versione 2.5.0; nessuna modifica all'archivio `legacy/`.
- 71 test unitari/Worker passati, inclusi migrazione ripetuta con sottoscrizione/reminder esistenti, auth indipendente dalle push, rate limit, conflitto SHA, retry durabile e aggiornamento concorrente.
- 24 Playwright mobile passati a 390×844; compreso riavvio davvero offline con service worker attivo e risposta editoriale ritardata mentre si modifica un modulo locale. Test esistenti di timer, split contabile, restore e piano conservati.
- Screenshot bacheca/lettore ispezionati; nessun overflow orizzontale a 390 px; corpo lettore 18,4 px con interlinea 1,8.
- Prima edizione validata: 542 / 2249 / 1243 parole. Radar etichettato evergreen. Fonti consultate con passaggi circoscritti; nessuna sintesi integrale o notizia non verificata.
- Task ChatGPT creata e attiva: redazione quotidiana alle 05:00 Europe/Rome, dal 21 ottobre 2026. Creazione confermata dal servizio; prima esecuzione e futura pubblicazione autonoma non ancora verificate.
- Feedback pubblico non provato contro D1/GitHub reali: mancano accesso Cloudflare e secret; i test usano SQLite reale come stand-in D1 e provider GitHub simulato. Il JSON iniziale dei voti è vuoto, senza voti di esempio spacciati per reali.

Versione correttiva 2.6.1: una risposta editoriale asincrona non ridisegna più un modulo durante la digitazione. Test prima riprodotto fallente (data del modulo cancellata), poi passato; cache shell incrementata. Deploy 2.6 iniziale confermato dal workflow Pages sul merge `384183e`; correzione distribuita separatamente dopo CI. È stata richiesta anche una prova immediata della task editoriale, asincrona: non equivale a esecuzione completata.

Versione correttiva 2.6.2: ID importati lunghi fino a 80 caratteri sono trasformati in identificativi push entro i 64 caratteri del Worker. Test riprodotto prima fallente: il catalogo accettava un ID che rendeva invalida la sincronizzazione dei reminder; ora il contratto è rispettato.
