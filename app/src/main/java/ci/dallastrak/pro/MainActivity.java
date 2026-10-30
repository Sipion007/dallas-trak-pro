package ci.dallastrak.pro;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Écran unique : l'espace chauffeur Dallas Trak, avec le pont vers le service de fond du téléphone. */
public class MainActivity extends Activity {
    static volatile boolean visible = false;
    private static MainActivity instance;

    private static final int REQ_SERVICE = 1, REQ_FICHIER = 2, REQ_GEO = 3, REQ_REGLAGE = 4;

    private WebView web;
    private String jetonEnAttente;
    private ValueCallback<Uri[]> fichiers;
    private Uri photo;
    private GeolocationPermissions.Callback geoRappel;
    private String geoOrigine;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle etat) {
        super.onCreate(etat);
        instance = this;
        ServicePro.creerCanaux(this);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0D1A15);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " DallasTrakPro/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new Pont(), "DTPro");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        if (etat != null) web.restoreState(etat);
        if (web.getUrl() == null) web.loadUrl(Config.PAGE);
        traiter(getIntent());
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        traiter(i);
    }

    private void traiter(Intent i) {
        if (i == null) return;
        if (i.hasExtra("offre")) {
            // Ouverte par une demande de course : s'affiche par-dessus l'écran verrouillé et l'allume
            if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
            else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            Log.i(Config.TAG, "ouverte par une demande " + i.getStringExtra("offre"));
        }
        if (BuildConfig.DEBUG && i.hasExtra("test_jeton")) {
            jetonEnAttente = i.getStringExtra("test_jeton");
            lancerService();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        visible = true;
        web.onResume();
        ServicePro s = ServicePro.instance;
        if (s != null) s.calmer();
        web.evaluateJavascript("window.DTProReveil&&window.DTProReveil()", null);
    }

    @Override
    protected void onPause() {
        visible = false;
        super.onPause();
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(false); setTurnScreenOn(false); }
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    protected void onSaveInstanceState(Bundle b) {
        super.onSaveInstanceState(b);
        web.saveState(b);
    }

    @Override
    protected void onDestroy() {
        if (instance == this) instance = null;
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    /** Demande à la page de se mettre à jour (appelé par le service). */
    static void reveillerPage() {
        MainActivity a = instance;
        if (a != null) a.runOnUiThread(() -> a.web.evaluateJavascript("window.DTProReveil&&window.DTProReveil()", null));
    }

    // ---------- Service de fond ----------
    private boolean accorde(String p) {
        return checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED;
    }

    private void demarrerService(String jeton) {
        jetonEnAttente = jeton;
        List<String> manque = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33 && !accorde(Manifest.permission.POST_NOTIFICATIONS)) manque.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!ServicePro.positionAutorisee(this)) {
            manque.add(Manifest.permission.ACCESS_FINE_LOCATION);
            manque.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (!manque.isEmpty()) requestPermissions(manque.toArray(new String[0]), REQ_SERVICE);
        else lancerService();
    }

    private void lancerService() {
        if (jetonEnAttente == null) return;
        if (!ServicePro.positionAutorisee(this)) {
            Toast.makeText(this, "Autorisez la position pour recevoir les courses proches.", Toast.LENGTH_LONG).show();
            reveillerPage();
            return;
        }
        ServicePro.demarrer(this, jetonEnAttente);
        jetonEnAttente = null;
        demanderBatterieUneFois();
        web.postDelayed(MainActivity::reveillerPage, 800);
    }

    private boolean batterieLibre() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        return pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    private void demanderBatterieUneFois() {
        if (batterieLibre() || ServicePro.prefs(this).getBoolean("batterie_demandee", false)) return;
        ServicePro.prefs(this).edit().putBoolean("batterie_demandee", true).apply();
        ouvrirReglage("batterie");
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == REQ_SERVICE) lancerService();
        if (code == REQ_GEO && geoRappel != null) {
            geoRappel.invoke(geoOrigine, ServicePro.positionAutorisee(this), false);
            geoRappel = null;
        }
        reveillerPage();
    }

    @SuppressLint("BatteryLife")
    private void ouvrirReglage(String quoi) {
        Uri paquet = Uri.parse("package:" + getPackageName());
        Intent i;
        switch (quoi) {
            case "notifs":
                if (Build.VERSION.SDK_INT >= 33 && !accorde(Manifest.permission.POST_NOTIFICATIONS)
                        && !ServicePro.prefs(this).getBoolean("notifs_demandees", false)) {
                    ServicePro.prefs(this).edit().putBoolean("notifs_demandees", true).apply();
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_REGLAGE);
                    return;
                }
                i = Build.VERSION.SDK_INT >= 26
                    ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, paquet);
                break;
            case "position":
                if (!ServicePro.prefs(this).getBoolean("position_demandee", false)) {
                    ServicePro.prefs(this).edit().putBoolean("position_demandee", true).apply();
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_REGLAGE);
                    return;
                }
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, paquet);
                break;
            case "plein_ecran":
                i = Build.VERSION.SDK_INT >= 34
                    ? new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, paquet)
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, paquet);
                break;
            case "batterie":
                i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, paquet);
                break;
            default:
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, paquet);
        }
        try { startActivity(i); }
        catch (Exception e) {
            try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, paquet)); } catch (Exception ignored) { }
        }
    }

    private String etat() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            boolean notifs = nm.areNotificationsEnabled()
                && (Build.VERSION.SDK_INT < 33 || accorde(Manifest.permission.POST_NOTIFICATIONS));
            boolean pleinEcran = Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent();
            return new JSONObject()
                .put("service", ServicePro.actif)
                .put("notifs", notifs)
                .put("position", ServicePro.positionAutorisee(this))
                .put("plein_ecran", pleinEcran)
                .put("batterie", batterieLibre())
                .put("modele", Build.MANUFACTURER + " " + Build.MODEL)
                .put("version", BuildConfig.VERSION_NAME)
                .toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    /** Fonctions disponibles pour la page (window.DTPro). */
    private class Pont {
        @JavascriptInterface public void demarrer(String jeton) { runOnUiThread(() -> demarrerService(jeton)); }
        @JavascriptInterface public void arreter() { runOnUiThread(() -> ServicePro.arreter(MainActivity.this)); }
        @JavascriptInterface public String etat() { return MainActivity.this.etat(); }
        @JavascriptInterface public void reglages(String quoi) { runOnUiThread(() -> ouvrirReglage(quoi)); }
        @JavascriptInterface public String version() { return BuildConfig.VERSION_NAME; }
    }

    // ---------- Navigation ----------
    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
            Uri u = req.getUrl();
            if ("https".equals(u.getScheme()) && Config.HOTE.equals(u.getHost())) return false;
            try {
                Intent i = "intent".equals(u.getScheme())
                    ? Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME)
                    : new Intent(Intent.ACTION_VIEW, u);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                startActivity(i);
            } catch (Exception e) {
                Log.w(Config.TAG, "lien externe : " + e);
            }
            return true;
        }

        @Override
        public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
            if (!req.isForMainFrame()) return;
            String page = "<!doctype html><html lang=fr><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<body style='margin:0;min-height:100vh;display:grid;place-items:center;background:#0D1A15;color:#EFE6D8;font-family:sans-serif;text-align:center;padding:24px;box-sizing:border-box'>"
                + "<div><h1 style='font-size:1.6rem;margin:0 0 10px'>Pas de connexion internet</h1>"
                + "<p style='color:#9AAEA2;margin:0 0 22px'>Vérifiez vos données mobiles, puis réessayez.</p>"
                + "<a href='" + Config.PAGE + "' style='display:inline-block;padding:16px 28px;border-radius:999px;background:#F2A93B;color:#0D1A15;font-weight:700;text-decoration:none'>Réessayer</a></div></body></html>";
            v.loadDataWithBaseURL(null, page, "text/html", "utf-8", null);
        }
    }

    // ---------- Position et photos pour la page ----------
    private class Chrome extends WebChromeClient {
        @Override
        public void onGeolocationPermissionsShowPrompt(String origine, GeolocationPermissions.Callback rappel) {
            if (ServicePro.positionAutorisee(MainActivity.this)) { rappel.invoke(origine, true, false); return; }
            geoRappel = rappel;
            geoOrigine = origine;
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_GEO);
        }

        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> rappel, FileChooserParams p) {
            if (fichiers != null) fichiers.onReceiveValue(null);
            fichiers = rappel;
            Intent choix = Intent.createChooser(p.createIntent(), "Choisir une photo");
            photo = null;
            if (Build.VERSION.SDK_INT >= 29) {
                try {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Images.Media.DISPLAY_NAME, "dallas-trak-" + System.currentTimeMillis() + ".jpg");
                    cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                    photo = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                    if (photo != null) {
                        Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, photo)
                            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                        choix.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
                    }
                } catch (Exception e) { photo = null; }
            }
            try { startActivityForResult(choix, REQ_FICHIER); }
            catch (ActivityNotFoundException e) { fichiers = null; return false; }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int code, int resultat, Intent data) {
        super.onActivityResult(code, resultat, data);
        if (code != REQ_FICHIER || fichiers == null) return;
        Uri[] r = WebChromeClient.FileChooserParams.parseResult(resultat, data);
        if (r == null && resultat == RESULT_OK && photo != null) r = new Uri[]{photo};
        else if (photo != null && (r == null || r.length == 0 || !photo.equals(r[0]))) {
            try { getContentResolver().delete(photo, null, null); } catch (Exception ignored) { }
        }
        fichiers.onReceiveValue(r);
        fichiers = null;
        photo = null;
    }
}
