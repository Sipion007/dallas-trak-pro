package ci.dallastrak.pro;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/**
 * Service de fond de Dallas Trak Pro.
 * Tant que le chauffeur est en service (ou en course), il envoie la position du téléphone et vérifie
 * toutes les quelques secondes s'il y a une demande de course. Une demande fait sonner le téléphone
 * comme un appel et allume l'écran, même verrouillé dans la poche.
 */
public class ServicePro extends Service implements LocationListener {
    static volatile ServicePro instance;
    static volatile boolean actif = false;

    static final String CANAL_SERVICE = "service";
    static final String CANAL_COURSES = "courses_v1";
    static final String CANAL_INFOS = "infos";
    static final int ID_PERMANENT = 1, ID_OFFRE = 2, ID_INFO = 3;
    private static final String DEMARRER = "ci.dallastrak.pro.DEMARRER";

    private HandlerThread fil;
    private Handler h;
    private PowerManager.WakeLock verrou;
    private LocationManager lm;
    private NotificationManager nm;
    private Vibrator vib;
    private MediaPlayer lecteur;

    private volatile Location derniere;
    private Location envoyee;
    private long envoyeeLe;
    private String jeton;
    private String offreEnCours;
    private String courseId, courseStatut, courseDepart;
    private int echecs;
    private boolean fini;
    private String texteEtat = "";
    private boolean positionLancee;

    // ---------- Commandes depuis l'application ----------
    static void demarrer(Context c, String jeton) {
        prefs(c).edit().putString("jeton", jeton).apply();
        Intent i = new Intent(c, ServicePro.class).setAction(DEMARRER).putExtra("jeton", jeton);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
    }

    static void arreter(Context c) {
        final String j = prefs(c).getString("jeton", null);
        prefs(c).edit().remove("jeton").apply();
        ServicePro s = instance;
        if (s != null) s.fini = true;
        c.stopService(new Intent(c, ServicePro.class));
        if (j != null) new Thread(() -> {
            try { Reseau.rpc("dt_pro_oublier", new JSONObject().put("p_jeton", j)); } catch (Exception ignored) { }
        }).start();
    }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(Config.PREFS, MODE_PRIVATE);
    }

    static boolean positionAutorisee(Context c) {
        return c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || c.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    // ---------- Cycle de vie ----------
    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        vib = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        creerCanaux(this);
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        verrou = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DallasTrak:service");
        verrou.setReferenceCounted(false);
        fil = new HandlerThread("dallastrak-service");
        fil.start();
        h = new Handler(fil.getLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String j = intent != null ? intent.getStringExtra("jeton") : null;
        if (j == null) j = prefs(this).getString("jeton", null);
        if (j == null || !positionAutorisee(this)) {
            Log.w(Config.TAG, "démarrage impossible : " + (j == null ? "pas de jeton" : "position refusée"));
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            Notification n = notifPermanente("Connexion au service Dallas Trak…", false);
            if (Build.VERSION.SDK_INT >= 29) startForeground(ID_PERMANENT, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(ID_PERMANENT, n);
        } catch (Exception e) {
            Log.e(Config.TAG, "premier plan refusé : " + e);
            stopSelf();
            return START_NOT_STICKY;
        }
        boolean nouveau = !j.equals(jeton);
        jeton = j;
        fini = false;
        actif = true;
        verrou.acquire();
        if (!positionLancee) demarrerPosition();
        if (nouveau) {
            h.removeCallbacks(sonde);
            h.post(sonde);
        }
        Log.i(Config.TAG, "service démarré");
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        actif = false;
        instance = null;
        h.removeCallbacksAndMessages(null);
        try { lm.removeUpdates(this); } catch (Exception ignored) { }
        arreterSonnerie();
        nm.cancel(ID_OFFRE);
        if (verrou.isHeld()) verrou.release();
        fil.quitSafely();
        Log.i(Config.TAG, "service arrêté");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ---------- Position ----------
    private void demarrerPosition() {
        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER))
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 4000, 10, this, fil.getLooper());
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10000, 20, this, fil.getLooper());
            Location l = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (l == null) l = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            if (l != null && System.currentTimeMillis() - l.getTime() < 10 * 60 * 1000) derniere = l;
            positionLancee = true;
        } catch (SecurityException | IllegalArgumentException e) {
            Log.w(Config.TAG, "position : " + e);
        }
    }

    @Override
    public void onLocationChanged(Location l) {
        Location d = derniere;
        boolean gps = LocationManager.GPS_PROVIDER.equals(l.getProvider());
        if (d == null || gps || !LocationManager.GPS_PROVIDER.equals(d.getProvider()) || l.getTime() - d.getTime() > 30000)
            derniere = l;
    }

    @Override public void onStatusChanged(String p, int s, Bundle b) { }
    @Override public void onProviderEnabled(String p) { }
    @Override public void onProviderDisabled(String p) { }

    // ---------- Vérification régulière ----------
    private final Runnable sonde = new Runnable() {
        @Override
        public void run() {
            if (fini) return;
            try { sonder(); } catch (Exception e) { Log.w(Config.TAG, "sonde : " + e); }
            if (!fini) h.postDelayed(this, offreEnCours != null ? 3000 : 5000);
        }
    };

    private void sonder() throws Exception {
        JSONObject corps = new JSONObject().put("p_jeton", jeton);
        Location l = derniere;
        long maintenant = System.currentTimeMillis();
        boolean avecPosition = l != null && (envoyee == null || l.distanceTo(envoyee) > 25 || maintenant - envoyeeLe > 25000);
        if (avecPosition) {
            corps.put("p_lat", l.getLatitude()).put("p_lng", l.getLongitude());
            if (l.hasBearing()) corps.put("p_cap", (double) l.getBearing());
        }
        String rep = Reseau.rpc("dt_pro_sonde", corps);
        if (rep == null) {
            echecs++;
            if (echecs == 3) majPermanente("Connexion internet perdue. Nouvelle tentative…");
            return;
        }
        if (echecs >= 3) texteEtat = "";
        echecs = 0;
        if (avecPosition) { envoyee = l; envoyeeLe = maintenant; }
        JSONObject r = new JSONObject(rep);
        if (!r.optBoolean("ok")) {
            terminer("Session Dallas Trak Pro expirée", "Ouvrez l'application pour reprendre le service.");
            return;
        }
        boolean enService = r.optBoolean("en_service");
        JSONObject course = r.optJSONObject("course");
        JSONArray offres = r.optJSONArray("offres");

        // Course annulée par le client ou l'équipe avant le départ
        String id = course != null ? course.optString("id", null) : null;
        if (courseId != null && id == null && !"en_cours".equals(courseStatut) && !MainActivity.visible) {
            info("Course annulée", "La course depuis " + courseDepart + " est annulée. Vous recevez de nouveau des demandes.");
        }
        courseId = id;
        courseStatut = course != null ? course.optString("statut") : null;
        courseDepart = course != null ? course.optString("depart_label") : null;

        if (!enService && id == null) {
            if (r.optBoolean("bloque")) terminer("Dallas Trak Pro est arrêté", "Votre compte ne peut pas recevoir de courses pour le moment. Ouvrez l'application.");
            else terminer("Vous êtes hors service", "Ouvrez Dallas Trak Pro pour reprendre le service.");
            return;
        }

        JSONObject o = offres != null && offres.length() > 0 ? offres.getJSONObject(0) : null;
        if (o != null) {
            String oid = o.getString("course_id");
            if (!oid.equals(offreEnCours)) {
                offreEnCours = oid;
                if (MainActivity.visible) MainActivity.reveillerPage();
                else sonner(o);
            }
        } else if (offreEnCours != null) {
            offreEnCours = null;
            arreterSonnerie();
            nm.cancel(ID_OFFRE);
        }
        majPermanente(id != null ? "Course en cours" + (courseDepart != null ? " depuis " + courseDepart : "")
                                 : "En service : en attente de courses");
    }

    private void terminer(String titre, String texte) {
        fini = true;
        prefs(this).edit().remove("jeton").apply();
        if (!MainActivity.visible) info(titre, texte);
        else MainActivity.reveillerPage();
        stopSelf();
    }

    /** Bouton « Passer hors service » de la notification permanente. */
    void horsServiceDemande() {
        h.post(() -> {
            try {
                String r = Reseau.rpc("dt_pro_hors_service", new JSONObject().put("p_jeton", jeton));
                if (r == null) { info("Connexion impossible", "Vérifiez internet, puis réessayez de passer hors service."); return; }
            } catch (Exception ignored) { }
            fini = true;
            prefs(this).edit().remove("jeton").apply();
            if (MainActivity.visible) MainActivity.reveillerPage();
            stopSelf();
        });
    }

    /** L'application est ouverte : elle affiche elle-même la demande. */
    void calmer() {
        h.post(() -> { arreterSonnerie(); nm.cancel(ID_OFFRE); });
    }

    // ---------- Sonnerie de nouvelle course ----------
    private void sonner(JSONObject o) {
        int reste = Math.max(5, o.optInt("reste_s", 25));
        String titre = "Nouvelle course : " + fmt(o.optInt("gain")) + " F pour vous";
        String texte = "Client à " + km(o.optDouble("distance_km", 0)) + " km, " + o.optString("depart_label")
            + ". Destination : " + o.optString("arrivee_label") + " (" + km(o.optDouble("km", 0)) + " km).";
        Intent ouvrir = new Intent(this, MainActivity.class)
            .putExtra("offre", o.optString("course_id"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 10, ouvrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent silence = PendingIntent.getBroadcast(this, 11,
            new Intent(this, ActionReceiver.class).setAction(ActionReceiver.SILENCE), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = constructeur(CANAL_COURSES)
            .setSmallIcon(R.drawable.ic_notif)
            .setColor(0xFFF2A93B)
            .setContentTitle(titre)
            .setContentText(texte)
            .setStyle(new Notification.BigTextStyle().bigText(texte))
            .setCategory(Notification.CATEGORY_CALL)
            .setPriority(Notification.PRIORITY_MAX)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(pi)
            .setFullScreenIntent(pi, true)
            .setDeleteIntent(silence)
            .setOngoing(true)
            .setAutoCancel(true)
            .setShowWhen(true)
            .addAction(new Notification.Action.Builder(null, "Voir la course", pi).build())
            .addAction(new Notification.Action.Builder(null, "Silence", silence).build());
        if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(reste * 1000L);
        else b.setSound(null).setVibrate(null);
        nm.notify(ID_OFFRE, b.build());
        jouerSonnerie(reste);
        Log.i(Config.TAG, "sonnerie démarrée pour " + o.optString("course_id") + " son=" + (lecteur != null && lecteur.isPlaying() ? "oui" : "non"));
    }

    private final Runnable finSonnerie = () -> { arreterSonnerie(); nm.cancel(ID_OFFRE); };

    private void jouerSonnerie(int secondes) {
        arreterSonnerie();
        Uri u = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        try {
            lecteur = new MediaPlayer();
            lecteur.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            lecteur.setDataSource(this, u);
            lecteur.setLooping(true);
            lecteur.prepare();
            lecteur.start();
        } catch (Exception e) {
            Log.w(Config.TAG, "sonnerie : " + e);
            if (lecteur != null) { lecteur.release(); lecteur = null; }
        }
        long[] motif = {0, 900, 500, 900, 500};
        try {
            if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createWaveform(motif, 1),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build());
            else vib.vibrate(motif, 1);
        } catch (Exception ignored) { }
        h.postDelayed(finSonnerie, secondes * 1000L);
    }

    private void arreterSonnerie() {
        if (h != null) h.removeCallbacks(finSonnerie);
        if (lecteur != null) {
            try { lecteur.stop(); } catch (Exception ignored) { }
            lecteur.release();
            lecteur = null;
        }
        try { vib.cancel(); } catch (Exception ignored) { }
    }

    // ---------- Notifications ----------
    static void creerCanaux(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel s = new NotificationChannel(CANAL_SERVICE, "Service en cours", NotificationManager.IMPORTANCE_LOW);
        s.setDescription("Indique que Dallas Trak Pro attend des courses.");
        s.setShowBadge(false);
        NotificationChannel co = new NotificationChannel(CANAL_COURSES, "Demandes de course", NotificationManager.IMPORTANCE_HIGH);
        co.setDescription("Sonne comme un appel à chaque nouvelle demande de course.");
        co.setSound(null, null);
        co.enableVibration(false);
        co.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        NotificationChannel in = new NotificationChannel(CANAL_INFOS, "Informations", NotificationManager.IMPORTANCE_HIGH);
        in.setDescription("Course annulée, fin de service.");
        in.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(s);
        nm.createNotificationChannel(co);
        nm.createNotificationChannel(in);
    }

    private Notification.Builder constructeur(String canal) {
        return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, canal) : new Notification.Builder(this);
    }

    private PendingIntent ouvrirApp(int code) {
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification notifPermanente(String texte, boolean boutonHors) {
        Notification.Builder b = constructeur(CANAL_SERVICE)
            .setSmallIcon(R.drawable.ic_notif)
            .setColor(0xFF5E9A6E)
            .setContentTitle("Dallas Trak Pro")
            .setContentText(texte)
            .setOngoing(true)
            .setShowWhen(false)
            .setContentIntent(ouvrirApp(20));
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
        if (boutonHors) {
            PendingIntent hors = PendingIntent.getBroadcast(this, 21,
                new Intent(this, ActionReceiver.class).setAction(ActionReceiver.HORS_SERVICE),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.addAction(new Notification.Action.Builder(null, "Passer hors service", hors).build());
        }
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    private void majPermanente(String texte) {
        if (texte.equals(texteEtat) || fini) return;
        texteEtat = texte;
        nm.notify(ID_PERMANENT, notifPermanente(texte, courseId == null));
    }

    private void info(String titre, String texte) {
        Notification.Builder b = constructeur(CANAL_INFOS)
            .setSmallIcon(R.drawable.ic_notif)
            .setColor(0xFFF2A93B)
            .setContentTitle(titre)
            .setContentText(texte)
            .setStyle(new Notification.BigTextStyle().bigText(texte))
            .setAutoCancel(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(ouvrirApp(30));
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        nm.notify(ID_INFO, b.build());
        Log.i(Config.TAG, "info : " + titre);
    }

    private static String fmt(int n) {
        return String.format(Locale.FRANCE, "%,d", n).replace(' ', ' ').replace(' ', ' ');
    }

    private static String km(double k) {
        return String.format(Locale.FRANCE, "%.1f", k);
    }
}
