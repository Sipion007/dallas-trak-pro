#!/usr/bin/env bash
# Test sur émulateur Android 14 : téléphone verrouillé, écran éteint, en veille profonde (comme dans une poche).
set -u
PKG=ci.dallastrak.pro
URL=https://urgpcwrhkvfcrvgrkfwq.supabase.co
CLE=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZ3Bjd3Joa3ZmY3J2Z3JrZndxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMTk2MjIsImV4cCI6MjEwNjY5NTYyMn0.QjnQMj27xaGTXpo7qeE8YUp9oGFvAyPqI7N6aUAzkc8
OUT=resultats; mkdir -p $OUT; : > $OUT/resultats.txt
ECHECS=0
log(){ echo "$*" | tee -a $OUT/resultats.txt; }
ok(){ log "OK     $*"; }
ko(){ log "ECHEC  $*"; ECHECS=$((ECHECS+1)); }
rpc(){ curl -s -X POST "$URL/rest/v1/rpc/$1" -H "apikey: $CLE" -H "Authorization: Bearer $CLE" -H "Content-Type: application/json" -d "$2"; }
essai(){ rpc dt_test_pro "{\"p_action\":\"$1\"}"; }
capture(){ adb exec-out screencap -p > "$OUT/$1.png"; }
eveil(){ adb shell dumpsys power | grep -m1 -o 'mWakefulness=[A-Za-z]*'; }

adb wait-for-device
log "Appareil : $(adb shell getprop ro.product.model) Android $(adb shell getprop ro.build.version.release)"
adb install -r -g app/build/outputs/apk/debug/app-debug.apk >/dev/null && ok "installation" || ko "installation"
adb shell appops set $PKG USE_FULL_SCREEN_INTENT allow
adb shell dumpsys deviceidle whitelist +$PKG >/dev/null
adb emu geo fix -6.4500 6.8770 >/dev/null
J=$(essai preparer | python3 -c 'import sys,json;print(json.load(sys.stdin)["jeton"])')
[ -n "$J" ] && ok "compte chauffeur de test prêt" || ko "préparation du compte de test"

adb logcat -c
adb shell am start -n $PKG/.MainActivity --es test_jeton "$J" >/dev/null
sleep 20
capture 01-application
adb shell dumpsys activity services $PKG | grep -q "isForeground=true" && ok "service de fond actif (premier plan)" || ko "service de fond absent"
E=$(essai etat); log "  base : $E"
python3 -c "import sys,json;e=json.loads(sys.argv[1]);sys.exit(0 if (e['appareil_vu_s'] or 99)<20 else 1)" "$E" && ok "le téléphone interroge le serveur" || ko "aucune interrogation du serveur"
python3 -c "import sys,json;e=json.loads(sys.argv[1]);sys.exit(0 if e['age_s']<40 else 1)" "$E" && ok "position envoyée par le téléphone" || ko "position non envoyée"

log "--- Téléphone verrouillé dans la poche : écran éteint puis veille profonde"
adb shell input keyevent KEYCODE_HOME; sleep 1
adb shell input keyevent KEYCODE_SLEEP; sleep 4
log "  écran : $(eveil)"
adb shell dumpsys battery unplug
adb shell dumpsys deviceidle force-idle >/dev/null
log "  veille : $(adb shell dumpsys deviceidle get deep)"
sleep 20
R=$(essai offre); log "  nouvelle demande de course : $R"
sleep 15
L=$(adb logcat -d -s DTPRO)
echo "$L" | grep -q "sonnerie démarrée" && ok "la demande fait sonner le téléphone" || ko "pas de sonnerie"
log "  $(echo "$L" | grep -m1 'sonnerie démarrée')"
[ "$(eveil)" = "mWakefulness=Awake" ] && ok "l'écran s'est allumé tout seul" || ko "écran resté éteint ($(eveil))"
adb shell dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | grep -q "$PKG/.MainActivity" && ok "Dallas Trak Pro affichée par-dessus l'écran verrouillé" || ko "application non affichée"
adb shell dumpsys window | grep -m1 -o "isKeyguardShowing=[a-z]*\|mShowingLockscreen=[a-z]*" | head -1 | sed 's/^/  /' | tee -a $OUT/resultats.txt
capture 02-demande-ecran-verrouille
adb shell dumpsys notification --noredact | grep -q "Nouvelle course" && ok "notification de course présente" || log "  (notification remplacée par l'écran plein, normal quand l'application s'ouvre)"
adb shell dumpsys deviceidle unforce >/dev/null; adb shell dumpsys battery reset

log "--- Expiration de la demande (25 secondes)"
adb shell input keyevent KEYCODE_HOME; sleep 30
adb shell dumpsys notification --noredact | grep -q "Nouvelle course" && ko "la demande expirée sonne encore" || ok "la demande expirée ne sonne plus"

log "--- Passage hors service depuis la notification"
rpc dt_pro_hors_service "{\"p_jeton\":\"$J\"}" >/dev/null
sleep 12
adb shell dumpsys activity services $PKG | grep -q "ServicePro" && ko "service toujours actif" || ok "service arrêté quand le chauffeur est hors service"
adb shell dumpsys notification --noredact | grep -q "hors service" && ok "notification « Vous êtes hors service » affichée" || ko "pas de notification de fin de service"
adb shell cmd statusbar expand-notifications; sleep 2; capture 03-notifications; adb shell cmd statusbar collapse

essai nettoyer >/dev/null
adb logcat -d > $OUT/journal-complet.txt
adb logcat -d -s DTPRO > $OUT/journal-dallastrak.txt
log "Bilan : $ECHECS échec(s)"
exit $ECHECS
