# SALDO Pocket 2.0

PWA per iPhone: PIN di 6 cifre all'avvio, archivio cifrato in locale (WebCrypto AES-256-GCM, PBKDF2), registrazione di spese CONTO/TEST, margini separati aggiornati manualmente da Windows, spese rapide, modifica/annullamento, storico e backup cifrato.

## Prima apertura e migrazione

Al primo avvio della 2.0 crea e conferma un PIN. Le spese già presenti nel vecchio archivio locale vengono migrate e cifrate; il vecchio archivio viene rimosso solo dopo il salvataggio cifrato. Non disinstallare o cancellare i dati Safari prima di aver creato un backup.

## Esportazione su Windows

**Esporta per Windows** genera un JSON con movimenti da riportare sul PC, con ID stabili per un'importazione futura senza duplicati. Fino a quando SALDO Windows non dispone di un importatore del formato `saldo-pocket-transfer-v1`, è necessario registrare le spese manualmente con **Copia elenco**. Il file JSON contiene importi e note NON cifrati: non condividerlo.

## Margini

I margini dei due conti sono copiati manualmente da SALDO Windows e Pocket sottrae solo le spese annotate e ancora da trasferire. Non è una sincronizzazione bancaria o finanziaria in tempo reale. Pocket avvisa quando il dato è vecchio.

## Privacy e recupero

La memoria locale è cifrata e resta sul dispositivo. Il PIN di 6 cifre non offre la stessa resistenza di una password lunga a un attacco offline: proteggi il dispositivo e i backup. Per recuperare dati cifrati dopo aver dimenticato il PIN serve un backup di cui conosci il PIN; non esiste un bypass. **Salva regolarmente un backup cifrato** fuori da Safari, perché svuotarne la memoria cancella l'archivio.

Non c'è pubblicità, sincronizzazione, connessione bancaria né invio di dati finanziari a server.
