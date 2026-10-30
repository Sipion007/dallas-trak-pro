package ci.dallastrak.pro;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Boutons des notifications (passer hors service, couper la sonnerie). */
public class ActionReceiver extends BroadcastReceiver {
    static final String HORS_SERVICE = "ci.dallastrak.pro.HORS_SERVICE";
    static final String SILENCE = "ci.dallastrak.pro.SILENCE";

    @Override
    public void onReceive(Context context, Intent intent) {
        ServicePro s = ServicePro.instance;
        if (s == null || intent == null) return;
        if (HORS_SERVICE.equals(intent.getAction())) s.horsServiceDemande();
        else if (SILENCE.equals(intent.getAction())) s.calmer();
    }
}
