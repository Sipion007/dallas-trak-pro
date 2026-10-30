package ci.dallastrak.pro;

/** Adresses du service Dallas Trak. La clé est la clé publique (lecture limitée par la base). */
final class Config {
    static final String HOTE = "dallas-trak.vercel.app";
    static final String PAGE = "https://" + HOTE + "/chauffeur.html?source=pro";
    static final String URL = "https://urgpcwrhkvfcrvgrkfwq.supabase.co";
    static final String CLE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZ3Bjd3Joa3ZmY3J2Z3JrZndxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMTk2MjIsImV4cCI6MjEwNjY5NTYyMn0.QjnQMj27xaGTXpo7qeE8YUp9oGFvAyPqI7N6aUAzkc8";
    static final String TAG = "DTPRO";
    static final String PREFS = "dallastrak";

    private Config() {}
}
