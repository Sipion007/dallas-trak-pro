/* Dallas Trak : travailleur hors ligne.
   Les pages de l'application viennent toujours du réseau quand il est là (mises à jour immédiates),
   avec une copie de secours si le réseau coupe. Les bibliothèques et polices sont gardées sur le téléphone
   pour un démarrage rapide et moins de données mobiles. L'espace administrateur n'est pas concerné. */
var VERSION='dallas-trak-2';
var COEUR=['app.html','client.html','chauffeur.html','suivi.html','commun.js','manifest.json','icone-192.png','icone-masque-512.png','icone-badge.png'];
var EXTERNES=['cdnjs.cloudflare.com','cdn.jsdelivr.net','fonts.googleapis.com','fonts.gstatic.com'];

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){
    return Promise.all(COEUR.map(function(u){return c.add(u).catch(function(){})}));
  }).then(function(){return self.skipWaiting()}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(l){
    return Promise.all(l.filter(function(k){return k!==VERSION}).map(function(k){return caches.delete(k)}));
  }).then(function(){return self.clients.claim()}));
});
self.addEventListener('fetch',function(e){
  var r=e.request;if(r.method!=='GET')return;
  var u=new URL(r.url);
  if(u.origin===self.location.origin){
    if(u.pathname.indexOf('/admin')===0||u.pathname==='/sw.js')return;
    e.respondWith(fetch(r).then(function(rep){
      if(rep&&rep.ok&&rep.type==='basic'){var copie=rep.clone();caches.open(VERSION).then(function(c){c.put(r,copie)})}
      return rep;
    }).catch(function(){
      return caches.match(r,{ignoreSearch:true}).then(function(x){
        if(x)return x;
        if(r.mode==='navigate')return caches.match('app.html');
        return Response.error();
      });
    }));
    return;
  }
  if(EXTERNES.indexOf(u.hostname)>-1){
    e.respondWith(caches.match(r).then(function(x){
      return x||fetch(r).then(function(rep){
        if(rep&&(rep.ok||rep.type==='opaque')){var copie=rep.clone();caches.open(VERSION).then(function(c){c.put(r,copie)})}
        return rep;
      });
    }));
  }
});

/* ---------- Notifications : reçues même téléphone verrouillé ---------- */
function attendre(ms){return new Promise(function(ok){setTimeout(ok,ms)})}
self.addEventListener('push',function(e){
  var d={};
  try{d=e.data?e.data.json():{}}catch(x){d={titre:'Dallas Trak',corps:e.data?e.data.text():''}}
  var offre=d.type==='offre',reste=d.expire?d.expire-Date.now():0,perimee=offre&&d.expire&&reste<=1500;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(fen){
    fen.forEach(function(c){c.postMessage({dt:'push',msg:d})});
    // Page Dallas Trak ouverte et visible : elle affiche déjà l'information, pas besoin de notification
    var vue=fen.some(function(c){return c.visibilityState==='visible'&&c.focused});
    if(vue)return;
    var titre=perimee?'Demande de course expirée':(d.titre||'Dallas Trak');
    var opt={
      body:perimee?'Une demande vous a été envoyée pendant que votre téléphone était hors connexion.':(d.corps||''),
      tag:d.tag||'dallas-trak',renotify:!perimee,
      icon:'icone-192.png',badge:'icone-badge.png',
      timestamp:d.envoye||Date.now(),
      requireInteraction:!perimee&&(offre||!!d.insistant),
      silent:!!perimee,
      data:{url:d.url||'/app.html',course_id:d.course_id||null,type:d.type||''}
    };
    if(!perimee)opt.vibrate=offre?[600,250,600,250,600,250,900]:d.insistant?[400,200,400]:[250];
    if(offre&&!perimee)opt.actions=[{action:'voir',title:'Voir la course'}];
    return self.registration.showNotification(titre,opt).then(function(){
      if(!offre||perimee)return;
      // La demande expire au bout de 25 secondes : la notification disparaît avec elle
      return attendre(Math.min(reste,30000)).then(function(){return self.registration.getNotifications({tag:d.tag})}).then(function(l){
        l.forEach(function(n){if(n.data&&n.data.course_id===d.course_id)n.close()});
      });
    });
  }));
});
self.addEventListener('notificationclick',function(e){
  e.notification.close();
  var cible=new URL((e.notification.data&&e.notification.data.url)||'/app.html',self.location.origin).href;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(fen){
    var meme=fen.filter(function(c){return c.url.split('?')[0].split('#')[0]===cible.split('?')[0]})[0];
    if(meme)return meme.focus().then(function(c){(c||meme).postMessage({dt:'push',msg:{type:'ouverture'}})});
    var autre=fen[0];
    if(autre&&autre.navigate)return autre.navigate(cible).then(function(c){return c&&c.focus()}).catch(function(){return self.clients.openWindow(cible)});
    return self.clients.openWindow(cible);
  }));
});
self.addEventListener('pushsubscriptionchange',function(e){
  // L'abonnement sera renouvelé à la prochaine ouverture de l'application
  e.waitUntil(Promise.resolve());
});
