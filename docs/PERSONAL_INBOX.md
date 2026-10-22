# Appunti personali — Aurelius 2.7

## Stato e separazione

Il codice del sito e gli editoriali restano in `AlbertoRacerro/Aurelius`, pubblico. Le note sono inviate solo dopo il collegamento esplicito al repository privato `AlbertoRacerro/-Aurelius-Personal` (il trattino iniziale fa parte del nome).

L'interfaccia Appunti funziona anche offline. Il testo è salvato in `state.personalInbox`; il codice di accesso è separato in `aurelius.personal.auth.v1` e non è esportato nei backup. Il backup normale conserva note, risultati e ricevute. Il pulsante Scollega rimuove la credenziale dal dispositivo, senza cancellare l'archivio locale o remoto.

Il Worker verifica la visibilità privata prima di ogni invio/lettura. Un token dedicato può accedere soltanto al repository personale. Non viene inviato l'intero stato locale: calendario, storico, salute e relazione non vengono esportati. Il contenuto delle note esplicitamente scritte nel box può essere personale ed è elaborato su Cloudflare, GitHub e ChatGPT.

## Ciclo

1. Il telefono salva una nota con UUID stabile.
2. `POST /v1/personal/notes` pubblica `inbox/<id>.json` con autenticazione. I retry verificano identità e contenuto; una collisione non sovrascrive la nota.
3. L'automazione ChatGPT legge le note senza risultato, segue `INBOX_PROTOCOL.md`, valida e crea `outbox/<id>.json`.
4. `POST /v1/personal/poll` riceve al massimo 10 identificativi noti al telefono e restituisce risultati validati. Il telefono sincronizza all'apertura, al ritorno in primo piano, al ritorno della rete, ogni minuto mentre è visibile e su richiesta.
5. Il client valida di nuovo e unisce aggiunte al proprio stato corrente. Non sostituisce mai l'intera memoria e non modifica voci esistenti. Ricevute persistenti impediscono il replay, anche dopo l'annullamento. Le attività con testo già presente non sono duplicate, anche se completate.
6. Annulla aggiunte rimuove solo gli elementi creati ancora identici all'originale. Modifiche o completamenti successivi restano intatti.

Tipi consentiti: task (Da fare), list (liste personali), idea (anche nella schermata Idee), proposal (proposta di calendario) e clarify (da chiarire). Nessuna scrittura automatica nel calendario. Scadenze senza orario non generano notifiche arbitrarie. Un `remind_at` esplicito viene aggiunto al sistema notifiche esistente dopo che il telefono riceve il risultato, se Web Push è già attivo. Il server non modifica la memoria di un telefono spento: applicazione e programmazione dei promemoria avvengono al successivo collegamento.

## Attivazione dal PC

La distribuzione del sito non distribuisce il Worker. Servono due nuovi segreti; quelli di push ed editoriale non vanno modificati.

1. Creare un fine-grained GitHub PAT per **il solo repository privato `-Aurelius-Personal`**, permesso **Contents: Read and write**. Non inserirlo nel telefono, nei file o in chat.
2. Dalla main aggiornata, installare le dipendenze (`npm ci`), entrare in `worker` ed eseguire `npx -y wrangler@4 login`.
3. Generare un codice personale: `openssl rand -hex 32`. Conservarlo in un password manager.
4. `npx -y wrangler@4 secret put PERSONAL_TOKEN`: incollare il codice personale.
5. `npx -y wrangler@4 secret put GITHUB_PERSONAL_TOKEN`: incollare il PAT GitHub.
6. Tornare nella radice del repository e avviare `bash worker/upgrade-editorial.sh`. Esegue test, validazione, migrazioni idempotenti 0002/0003 e deploy. Non genera/ruota le chiavi VAPID. Non usare il vecchio `deploy.sh`.
7. Nel telefono aprire Appunti → Collega archivio privato, inserire **il codice personale**, una sola volta, e sincronizzare.
8. Verificare separatamente: nota sul dispositivo → file nel repo privato → risultato dell'automazione → applicazione sul telefono. Non considerare il solo salvataggio locale come prova del ciclo remoto.

Finché mancano configurazione, token o deploy, la nota resta sul dispositivo. Errori 401/409/429/503 non valgono come conferma di ricezione. Il Worker usa un limite persistente di 30 richieste/minuto distinto dall'editoriale. Nessun testo personale viene scritto nei log applicativi o nelle tabelle D1.

## Limiti v1

Massimo 400 note locali, 20 operazioni per nota, 5 invii e 10 verifiche per ciclo di sincronizzazione, 20 note per esecuzione AI. Nessuna cancellazione automatica. Il server interrompe i nuovi invii se la directory inbox raggiunge 900 elementi: prima di quel limite serve una procedura esplicita di archiviazione. L'automazione non deve interpretare un elenco troncato come completo.

Le voci delle liste e le idee si spuntano in Appunti. L'annullamento è locale e non è una sincronizzazione bidirezionale di tutte le modifiche tra dispositivi. Non viene condiviso automaticamente il calendario: le proposte temporali non possono presumere di conoscere i suoi slot liberi. Il codice personale resta in localStorage: non è incluso nei backup, ma è leggibile da JavaScript della stessa origine come la credenziale editoriale esistente.

## Memoria privata e suggerimenti — aggiornamento 2.9 (22 ottobre 2026)

La precedente esclusione di tutto lo stato locale dall'archivio è superata dalla richiesta esplicita del proprietario. `src/private-sync.js` archivia automaticamente, con il codice personale collegato, copie distinte per dispositivo di stato locale e preferenze selezionate. Credenziali, sottoscrizioni push e canale ntfy sono esclusi; il record sanitario separato del calendario indicativo resta locale ed è escluso sia dalla copia sia dal contesto del pianificatore. Non esiste un merge automatico fra telefono e tablet. Le copie remote non sostituiscono mai lo stato locale.

Richieste POST aggiuntive: `/v1/personal/snapshot` e `/v1/personal/pause`. Migrazione idempotente `0004_private_sync.sql`; eseguire lo script aggiornato `bash worker/upgrade-editorial.sh` per applicare tutte le migrazioni e distribuire. Nessun nuovo segreto richiesto. Senza aggiornamento Worker gli Appunti continuano a funzionare, mentre lo stato della copia privata segnala il blocco e conserva i dati sul dispositivo.

Il pianificatore notturno scrive solo `planning/reminders.json` nell'archivio privato; il Worker importa e controlla le proposte e le manda attraverso Web Push esistente, anche ad app chiusa. Vedere `docs/PRIVATE_PLANNING_AUTOMATION.md`. Le informazioni remote sono l'ultima copia confermata, non il contenuto corrente di un dispositivo offline.
