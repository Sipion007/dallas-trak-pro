# Dallas Trak Pro

Application Android des chauffeurs Dallas Trak : l'espace chauffeur, plus un service de fond qui
fait sonner le téléphone comme un appel à chaque demande de course, même verrouillé dans la poche.

- Chaque envoi sur `main` compile l'application et publie la version signée.
- Le test sur téléphone Android 14 simulé (écran éteint, veille profonde) se lance à la main
  (onglet Actions, « Run workflow ») ; il demande la fonction de test `dt_test_pro` dans la base.
  Les résultats sont publiés dans les « Releases » `test-N`.
- La version à installer est publiée dans la dernière Release : `dallas-trak-pro.apk`.
- La signature utilise deux secrets du dépôt : `DT_CLE` (la clé, en base64) et `DT_SIGNATURE` (son mot de passe).
