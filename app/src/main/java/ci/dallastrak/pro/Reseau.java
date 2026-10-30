package ci.dallastrak.pro;

import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Appels aux fonctions de la base Dallas Trak (petites requêtes, connexion réutilisée). */
final class Reseau {
    private Reseau() {}

    /** Renvoie le corps de la réponse, ou null si le réseau ou le serveur a échoué. */
    static String rpc(String nom, JSONObject corps) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(Config.URL + "/rest/v1/rpc/" + nom).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("apikey", Config.CLE);
            c.setRequestProperty("Authorization", "Bearer " + Config.CLE);
            byte[] b = corps.toString().getBytes(StandardCharsets.UTF_8);
            c.setFixedLengthStreamingMode(b.length);
            try (OutputStream o = c.getOutputStream()) { o.write(b); }
            int s = c.getResponseCode();
            String t = lire(s < 400 ? c.getInputStream() : c.getErrorStream());
            if (s >= 200 && s < 300) return t;
            Log.w(Config.TAG, "rpc " + nom + " : " + s + " " + t);
            return null;
        } catch (Exception e) {
            Log.w(Config.TAG, "rpc " + nom + " : " + e);
            if (c != null) c.disconnect();
            return null;
        }
    }

    private static String lire(InputStream in) throws java.io.IOException {
        if (in == null) return "";
        try (InputStream i = in) {
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            byte[] tampon = new byte[4096];
            int n;
            while ((n = i.read(tampon)) > 0) o.write(tampon, 0, n);
            return o.toString("UTF-8");
        }
    }
}
