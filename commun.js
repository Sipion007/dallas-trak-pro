/* Dallas Trak : éléments partagés par l'application client, l'application chauffeur, l'espace administrateur et la page de suivi. */
(function(){
'use strict';
var DT={};
DT.URL='https://urgpcwrhkvfcrvgrkfwq.supabase.co';
DT.CLE='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZ3Bjd3Joa3ZmY3J2Z3JrZndxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMTk2MjIsImV4cCI6MjEwNjY5NTYyMn0.QjnQMj27xaGTXpo7qeE8YUp9oGFvAyPqI7N6aUAzkc8';
DT.DALOA=[6.88786,-6.45191];
DT.ZONE='-6.52,6.83,-6.38,6.94';
DT.PAIEMENTS={especes:'Espèces',orange:'Orange Money',mtn:'MTN MoMo',moov:'Moov Money',wave:'Wave'};
DT.CONFIG={prix_base:500,prix_km:150,prix_min:1000,arrondi:50,commission_pct:10,seuil_solde:500,rayon_km:8,momo_orange:'',momo_mtn:'',momo_moov:'',momo_wave:'',service_tel:''};

// Lieux réels de Daloa (positions OpenStreetMap)
DT.LIEUX=[
  {n:'Mairie de Daloa',d:'Commerce',lat:6.88615,lng:-6.45153},
  {n:'Centre Hospitalier Régional',d:'CHR de Daloa',lat:6.88270,lng:-6.43963},
  {n:'Université Jean Lorougnon Guédé',d:'Université',lat:6.89446,lng:-6.44112},
  {n:'Gare TSR',d:'Gare routière, Tazibouo',lat:6.89273,lng:-6.43383},
  {n:'Gare CTE',d:'Gare routière, Abattoir',lat:6.87033,lng:-6.44392},
  {n:'Marché de Kennedy',d:'Marché',lat:6.88975,lng:-6.47059},
  {n:'Marché Abattoir',d:'Marché',lat:6.86976,lng:-6.44125},
  {n:'Marché de Gbokora',d:'Marché',lat:6.91010,lng:-6.45340},
  {n:'Cathédrale du Christ-Roi',d:'Lieu de culte',lat:6.88321,lng:-6.44799},
  {n:'Préfecture de Daloa',d:'Administration',lat:6.88464,lng:-6.45112},
  {n:'Commerce',d:'Quartier',lat:6.88786,lng:-6.45191},
  {n:'Lobia',d:'Quartier',lat:6.89262,lng:-6.44510},
  {n:'Tazibouo',d:'Quartier',lat:6.89396,lng:-6.43381},
  {n:'Piscine',d:'Quartier',lat:6.89522,lng:-6.44275},
  {n:'Ségou',d:'Quartier',lat:6.88261,lng:-6.45289},
  {n:'Gbokora',d:'Quartier',lat:6.90694,lng:-6.45059},
  {n:'Dioulabougou',d:'Quartier',lat:6.87629,lng:-6.44765},
  {n:'Labia',d:'Quartier',lat:6.87492,lng:-6.44021},
  {n:'Évêché',d:'Quartier',lat:6.88866,lng:-6.43113},
  {n:'Kirman',d:'Quartier',lat:6.88450,lng:-6.44230},
  {n:'Abattoir',d:'Quartier',lat:6.86705,lng:-6.44106},
  {n:'Orly',d:'Quartier',lat:6.86927,lng:-6.45993},
  {n:'Orly Extension 1',d:'Quartier',lat:6.86149,lng:-6.46433},
  {n:'Kennedy',d:'Quartier',lat:6.88488,lng:-6.47946},
  {n:'Sud A',d:'Quartier',lat:6.86015,lng:-6.44060},
  {n:'Sud B',d:'Quartier',lat:6.86094,lng:-6.42948},
  {n:'Sud C (Collège)',d:'Quartier',lat:6.87118,lng:-6.42973},
  {n:'Zone Industrielle',d:'Quartier',lat:6.89526,lng:-6.46952}
];

/* ---------- Connexion à la base ---------- */
DT.client=function(cleStockage){
  return window.supabase.createClient(DT.URL,DT.CLE,{auth:{storageKey:cleStockage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
};
DT.telNorm=function(t){return String(t||'').replace(/[^0-9]/g,'')};
DT.telValide=function(t){return /^(0[157]|2[157])[0-9]{8}$/.test(DT.telNorm(t))};
DT.telAff=function(t){var n=DT.telNorm(t);return n.length===10?n.replace(/(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/,'$1 $2 $3 $4 $5'):String(t||'')};
DT.email=function(t){return DT.telNorm(t)+'@dallastrak.app'};

// Inscription : crée le compte puis ouvre la session
DT.inscrire=function(sb,nom,tel,mdp){
  return fetch(DT.URL+'/functions/v1/dt-inscription',{method:'POST',headers:{'Content-Type':'application/json',apikey:DT.CLE},body:JSON.stringify({nom:nom,telephone:DT.telNorm(tel),mot_de_passe:mdp})})
  .then(function(r){return r.json().catch(function(){return{erreur:'Inscription impossible pour le moment.'}})})
  .then(function(j){
    if(!j||!j.ok)throw new Error((j&&j.erreur)||'Inscription impossible pour le moment.');
    return DT.connecter(sb,tel,mdp);
  });
};
DT.connecter=function(sb,tel,mdp){
  return sb.auth.signInWithPassword({email:DT.email(tel),password:mdp}).then(function(r){
    if(r.error){
      if(/invalid login|invalid credentials|invalid_grant/i.test(r.error.message))throw new Error('Numéro ou mot de passe incorrect.');
      throw r.error;
    }
    return r.data;
  });
};

// Message d'erreur compréhensible
DT.msg=function(e){
  var m=(e&&(e.message||e.error_description||e.erreur))||String(e||'');
  if(/failed to fetch|networkerror|load failed|network request failed/i.test(m))return 'Connexion internet impossible. Vérifiez vos données mobiles puis réessayez.';
  if(/jwt|token|not authenticated|session/i.test(m))return 'Votre session a expiré. Reconnectez-vous.';
  if(/permission denied|not allowed|row-level/i.test(m))return 'Action non autorisée.';
  return m||'Une erreur est survenue. Réessayez.';
};
DT.appel=function(promesse){
  return Promise.resolve(promesse).then(function(r){if(r&&r.error)throw r.error;return r?r.data:null});
};

DT.chargerConfig=function(sb){
  return DT.appel(sb.from('dt_config').select('*').limit(1).maybeSingle()).then(function(c){if(c)DT.CONFIG=c;return DT.CONFIG}).catch(function(){return DT.CONFIG});
};
DT.prix=function(km){var c=DT.CONFIG;return Math.round(Math.max(c.prix_min,c.prix_base+c.prix_km*km)/c.arrondi)*c.arrondi};
DT.momoDallas=function(op){return DT.CONFIG['momo_'+op]||''};

/* ---------- Outils ---------- */
DT.esc=function(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
DT.fmt=function(n){return Math.round(Number(n)||0).toLocaleString('fr-FR').replace(/\s/g,' ')};
DT.km=function(k){return (Number(k)||0).toFixed(1).replace('.',',')};
var ACCENTS=new RegExp('['+String.fromCharCode(768)+'-'+String.fromCharCode(879)+']','g');
DT.norm=function(x){x=String(x).toLowerCase();return (x.normalize?x.normalize('NFD'):x).replace(ACCENTS,'')};
DT.dist=function(a,b){var R=6371,r=Math.PI/180,dLa=(b.lat-a.lat)*r,dLo=(b.lng-a.lng)*r;var h=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLo/2)*Math.sin(dLo/2);return 2*R*Math.asin(Math.sqrt(h))};
DT.cap=function(a,b){var r=Math.PI/180,y=Math.sin((b.lng-a.lng)*r)*Math.cos(b.lat*r),x=Math.cos(a.lat*r)*Math.sin(b.lat*r)-Math.sin(a.lat*r)*Math.cos(b.lat*r)*Math.cos((b.lng-a.lng)*r);return(Math.atan2(y,x)*180/Math.PI+360)%360};
DT.heure=function(d){d=new Date(d);return String(d.getHours()).padStart(2,'0')+' h '+String(d.getMinutes()).padStart(2,'0')};
DT.quand=function(d){
  d=new Date(d);var auj=new Date();auj.setHours(0,0,0,0);var j=new Date(d);j.setHours(0,0,0,0);var diff=Math.round((auj-j)/864e5);
  if(diff===0)return "Aujourd'hui, "+DT.heure(d);
  if(diff===1)return 'Hier, '+DT.heure(d);
  if(diff===-1)return 'Demain, '+DT.heure(d);
  return d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'})+', '+DT.heure(d);
};
DT.dans=function(min){min=Math.max(0,Math.round(min));return min<1?'moins d’1 min':min+' min'};

var toastT;
DT.toast=function(msg,long){
  var t=document.getElementById('toast');if(!t)return;
  t.textContent=msg;t.classList.add('vu');clearTimeout(toastT);
  toastT=setTimeout(function(){t.classList.remove('vu')},long?5200:2800);
};

// Réduit une photo avant l'envoi (moins de données mobiles)
DT.compresser=function(fichier,cote){
  cote=cote||1400;
  return new Promise(function(ok,ko){
    var url=URL.createObjectURL(fichier),img=new Image();
    img.onload=function(){
      var w=img.naturalWidth,h=img.naturalHeight,k=Math.min(1,cote/Math.max(w,h));
      var cv=document.createElement('canvas');cv.width=Math.round(w*k);cv.height=Math.round(h*k);
      cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob(function(b){b?ok(b):ko(new Error('Photo illisible'))},'image/jpeg',.82);
    };
    img.onerror=function(){URL.revokeObjectURL(url);ko(new Error('Photo illisible. Choisissez une autre photo.'))};
    img.src=url;
  });
};

/* ---------- Carte ---------- */
DT.SVG_VOITURE='<svg width="26" height="40" viewBox="0 0 26 40"><rect x="2" y="2" width="22" height="36" rx="8" fill="#1C3229" stroke="#EFE6D8" stroke-width="1.5"/><rect x="6" y="9" width="14" height="7" rx="2" fill="#0D1A15"/><rect x="6" y="26" width="14" height="5" rx="2" fill="#0D1A15"/><rect x="1" y="18" width="24" height="3" rx="1.5" fill="#F2A93B"/></svg>';
DT.iconeVoiture=function(cls){return L.divIcon({className:'',html:'<div class="m-voiture '+(cls||'')+'">'+DT.SVG_VOITURE+'</div>',iconSize:[44,44],iconAnchor:[22,22]})};
DT.icone=function(cls){return L.divIcon({className:'',html:'<div class="'+cls+'"></div>',iconSize:[22,22],iconAnchor:[11,11]})};
DT.orienter=function(m,deg){if(deg==null)return;var el=m&&m.getElement&&m.getElement();if(el){var s=el.querySelector('svg');if(s)s.style.transform='rotate('+deg+'deg)'}};

DT.carte=function(id,options){
  var carte=L.map(id,Object.assign({zoomControl:false,attributionControl:false,maxZoom:19},options||{})).setView(DT.DALOA,15);
  L.control.attribution({position:'topright',prefix:false}).addTo(carte);
  var tuiles=null;
  carte.poserTuiles=function(vue,leger){
    if(tuiles)carte.removeLayer(tuiles);
    var c=[],esri='https://server.arcgisonline.com/ArcGIS/rest/services/';
    if(vue==='satellite'&&!leger){
      c.push(L.tileLayer(esri+'World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:18,maxZoom:19,attribution:'Images &copy; Esri, Maxar, Earthstar Geographics'}));
      c.push(L.tileLayer(esri+'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:18,maxZoom:19}));
      c.push(L.tileLayer(esri+'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:18,maxZoom:19}));
    }else if(location.protocol.indexOf('http')===0){
      c.push(L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; contributeurs OpenStreetMap'}));
    }else{
      c.push(L.tileLayer(esri+'World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:18,maxZoom:19,attribution:'&copy; Esri, contributeurs OpenStreetMap'}));
    }
    tuiles=L.layerGroup(c).addTo(carte);
  };
  // Noms des quartiers, visibles à partir du zoom 14
  L.layerGroup(DT.LIEUX.filter(function(l){return l.d==='Quartier'}).map(function(l){
    return L.marker([l.lat,l.lng],{icon:L.divIcon({className:'',html:'<span class="m-quartier">'+DT.esc(l.n)+'</span>',iconSize:[0,0]}),interactive:false,keyboard:false});
  })).addTo(carte);
  function noms(){document.getElementById(id).classList.toggle('carte-loin',carte.getZoom()<14)}
  carte.on('zoomend',noms);noms();
  return carte;
};

// Déplacement fluide d'un marqueur vers une nouvelle position
DT.glisser=function(m,lat,lng,ms){
  var de=m.getLatLng(),t0=null;ms=ms||900;
  if(!de||document.hidden||DT.dist({lat:de.lat,lng:de.lng},{lat:lat,lng:lng})>1.5){m.setLatLng([lat,lng]);return}
  if(m._dtAnim)cancelAnimationFrame(m._dtAnim);
  function pas(ts){if(!t0)t0=ts;var k=Math.min(1,(ts-t0)/ms);m.setLatLng([de.lat+(lat-de.lat)*k,de.lng+(lng-de.lng)*k]);if(k<1)m._dtAnim=requestAnimationFrame(pas);else m._dtAnim=null}
  m._dtAnim=requestAnimationFrame(pas);
  setTimeout(function(){if(m._dtAnim){cancelAnimationFrame(m._dtAnim);m._dtAnim=null;m.setLatLng([lat,lng])}},ms+400);
};

// Adresse réelle d'un point (rue et quartier)
DT.adresse=function(lat,lng){
  var ctrl=('AbortController' in window)?new AbortController():null,t=setTimeout(function(){if(ctrl)ctrl.abort()},6000);
  return fetch('https://photon.komoot.io/reverse?lat='+lat+'&lon='+lng+'&lang=fr',ctrl?{signal:ctrl.signal}:{}).then(function(r){return r.json()}).then(function(js){
    clearTimeout(t);var p=js.features&&js.features[0]&&js.features[0].properties;if(!p)return null;
    var m=[p.name||p.street,p.district||p.locality||p.city].filter(function(x,k,a){return x&&a.indexOf(x)===k});
    return m.join(', ')||null;
  }).catch(function(){clearTimeout(t);return null});
};
// Recherche de lieux dans Daloa
DT.chercher=function(q){
  return fetch('https://photon.komoot.io/api/?q='+encodeURIComponent(q)+'&bbox='+DT.ZONE+'&limit=8&lang=fr').then(function(r){return r.json()}).then(function(js){
    var vus={};
    return (js.features||[]).map(function(f){var p=f.properties;return{n:p.name||p.street||'Lieu sans nom',d:[p.street&&p.name?p.street:null,p.district||p.locality||'Daloa'].filter(Boolean).join(', '),lat:f.geometry.coordinates[1],lng:f.geometry.coordinates[0]}})
      .filter(function(r){var k=r.n+r.d;if(vus[k])return false;vus[k]=1;return true});
  });
};
// Itinéraire par les vraies routes, sinon estimation
DT.itineraire=function(a,b){
  var url='https://router.project-osrm.org/route/v1/driving/'+a.lng+','+a.lat+';'+b.lng+','+b.lat+'?overview=full&geometries=geojson';
  var ctrl=('AbortController' in window)?new AbortController():null,t=setTimeout(function(){if(ctrl)ctrl.abort()},6000);
  return fetch(url,ctrl?{signal:ctrl.signal}:{}).then(function(r){return r.json()}).then(function(j){
    clearTimeout(t);if(!j.routes||!j.routes.length)throw new Error('vide');
    var r=j.routes[0];return{coords:r.geometry.coordinates.map(function(c){return[c[1],c[0]]}),km:r.distance/1000,min:r.duration/60,reel:true};
  }).catch(function(){
    clearTimeout(t);var d=DT.dist(a,b)*1.3;
    return{coords:[[a.lat,a.lng],[b.lat,b.lng]],km:d,min:d/22*60+2,reel:false};
  });
};

// Garder l'écran allumé (chauffeur en service)
var verrou=null;
DT.ecranAllume=function(on){
  try{
    if(on&&'wakeLock' in navigator){navigator.wakeLock.request('screen').then(function(v){verrou=v}).catch(function(){})}
    else if(!on&&verrou){verrou.release();verrou=null}
  }catch(e){}
};

/* ---------- Installation de l'application sur le téléphone ---------- */
// Android (Chrome, Edge, Samsung Internet) : le téléphone propose l'installation en un geste.
// iPhone : Apple impose le passage par « Partager », on affiche la marche à suivre.
var invite=null,ecouteursInst=[],aideOuverte=null;
function signaler(){
  if(DT.installee())document.querySelectorAll('.dt-inst,[data-si-installable]').forEach(function(x){x.remove()});
  ecouteursInst.forEach(function(f){try{f()}catch(e){}});
  if(aideOuverte)aideOuverte();
}
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();invite=e;signaler()});
window.addEventListener('appinstalled',function(){
  invite=null;try{localStorage.setItem('dt-installee','1')}catch(e){}
  fermerAide();
  document.querySelectorAll('.dt-inst,[data-si-installable]').forEach(function(x){x.remove()});
  DT.toast('Dallas Trak est installée. Retrouvez-la sur l’écran d’accueil de votre téléphone.',true);
  ecouteursInst.forEach(function(f){try{f()}catch(e){}});
});
DT.installee=function(){
  if(window.DTPro)return true;
  try{if(window.matchMedia&&(matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||matchMedia('(display-mode: minimal-ui)').matches))return true}catch(e){}
  return navigator.standalone===true;
};
DT.surInstallation=function(f){ecouteursInst.push(f)};
DT.plateforme=function(){
  var ua=navigator.userAgent||'';
  var ios=/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(/FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|Snapchat|TikTok|musical_ly|WhatsApp|; wv\)/i.test(ua))return ios?'integre-ios':'integre';
  if(ios)return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)?'ios-autre':'ios';
  if(/Android/i.test(ua))return 'android';
  return 'ordinateur';
};
function lienPropre(){return location.origin+location.pathname}
function lienChrome(){return 'intent://'+location.host+location.pathname+'#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url='+encodeURIComponent(lienPropre())+';end'}
DT.installer=function(){
  if(invite){
    var e=invite;invite=null;
    try{e.prompt()}catch(x){aide();return Promise.resolve('aide')}
    return Promise.resolve(e.userChoice).then(function(r){
      if(r&&r.outcome==='accepted')DT.toast('Installation en cours… L’icône Dallas Trak apparaît sur votre écran d’accueil.',true);
      signaler();return r&&r.outcome;
    }).catch(function(){signaler()});
  }
  aide();return Promise.resolve('aide');
};
// Bloc « Installer l'application » à placer dans un écran
DT.blocInstallation=function(fermable){
  if(DT.installee())return '';
  if(fermable){var t=0;try{t=+localStorage.getItem('dt-install-plus-tard')||0}catch(e){}if(Date.now()-t<3*864e5)return ''}
  return '<div class="dt-inst"><div class="dt-inst-txt"><b>Installez l’application Dallas Trak</b><span>Sur votre écran d’accueil, comme une application du téléphone. Gratuit et léger.</span></div>'+
    '<div class="dt-inst-act"><button type="button" class="dt-inst-btn" data-installer>Installer</button>'+(fermable?'<button type="button" class="dt-inst-tard" data-installer-tard>Plus tard</button>':'')+'</div></div>';
};
document.addEventListener('click',function(e){
  var t=e.target&&e.target.closest?e.target:null;if(!t)return;
  if(t.closest('[data-installer]')){e.preventDefault();DT.installer();return}
  var tard=t.closest('[data-installer-tard]');
  if(tard){e.preventDefault();try{localStorage.setItem('dt-install-plus-tard',String(Date.now()))}catch(x){}var b=tard.closest('.dt-inst');if(b)b.remove()}
});
function fermerAide(){var m=document.getElementById('dt-aide');if(m)m.remove();aideOuverte=null}
function aide(){
  fermerAide();
  var m=document.createElement('div');m.id='dt-aide';m.className='dt-aide';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-labelledby','dt-aide-titre');
  function etapes(l){return '<ol class="dt-etapes">'+l.map(function(x){return '<li><span>'+x+'</span></li>'}).join('')+'</ol>'}
  function remplir(){
    var p=DT.plateforme(),h='';
    if(invite){
      h='<h2 id="dt-aide-titre">L’installation est prête</h2><p>Touchez le bouton ci-dessous, puis confirmez avec « Installer ».</p><button type="button" class="dt-inst-btn dt-plein" data-installer>Installer maintenant</button>';
    }else if(p==='integre'){
      h='<h2 id="dt-aide-titre">Ouvrez Dallas Trak dans Chrome</h2><p>Ce lien s’est ouvert à l’intérieur d’une autre application (WhatsApp, Facebook…). L’installation se fait depuis le navigateur Chrome.</p>'+
        '<a class="dt-inst-btn dt-plein" href="'+lienChrome()+'">Ouvrir dans Chrome</a>'+
        '<p class="dt-petit">Ensuite, touchez « Installer » sur la page qui s’ouvre.</p><button type="button" class="dt-lien" data-copier>Copier le lien</button>';
    }else if(p==='integre-ios'){
      h='<h2 id="dt-aide-titre">Ouvrez Dallas Trak dans Safari</h2><p>Ce lien s’est ouvert à l’intérieur d’une autre application. Sur iPhone, l’installation se fait depuis Safari.</p>'+
        etapes(['Touchez « Copier le lien » ci-dessous.','Ouvrez Safari et collez le lien dans la barre d’adresse.','Touchez « Installer » sur la page Dallas Trak.'])+
        '<button type="button" class="dt-inst-btn dt-plein" data-copier>Copier le lien</button>';
    }else if(p==='ios'){
      h='<h2 id="dt-aide-titre">Installer sur iPhone</h2><p>Apple ne permet pas l’installation en un seul geste. Cela prend trois touches :</p>'+
        etapes(['Touchez le bouton <b>Partager</b> de Safari, en bas de l’écran (le carré avec une flèche vers le haut).','Faites défiler et touchez <b>Sur l’écran d’accueil</b>.','Touchez <b>Ajouter</b> en haut à droite.'])+
        '<p class="dt-petit">L’icône Dallas Trak apparaît alors sur votre écran d’accueil.</p>';
    }else if(p==='ios-autre'){
      h='<h2 id="dt-aide-titre">Installer sur iPhone</h2>'+
        etapes(['Touchez le bouton <b>Partager</b> du navigateur (en haut à droite).','Touchez <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.'])+
        '<p class="dt-petit">Si cette option n’apparaît pas, ouvrez ce lien dans Safari.</p><button type="button" class="dt-lien" data-copier>Copier le lien</button>';
    }else if(p==='android'){
      h='<h2 id="dt-aide-titre">Installer sur Android</h2><p>Votre navigateur n’a pas encore proposé l’installation automatique. Faites-le en trois touches :</p>'+
        etapes(['Ouvrez le menu du navigateur : les <b>trois points</b> en haut à droite.','Touchez <b>Installer l’application</b> ou <b>Ajouter à l’écran d’accueil</b>.','Confirmez avec <b>Installer</b>.'])+
        '<p class="dt-petit">Vous n’êtes pas dans Chrome ?</p><a class="dt-inst-btn dt-ligne" href="'+lienChrome()+'">Ouvrir dans Chrome</a>';
    }else{
      h='<h2 id="dt-aide-titre">Installer sur l’ordinateur</h2>'+
        etapes(['Dans Chrome ou Edge, cliquez sur l’icône d’installation à droite de la barre d’adresse.','Cliquez sur <b>Installer</b>.'])+
        '<p class="dt-petit">Pour le téléphone, ouvrez ce même lien dans Chrome sur Android ou dans Safari sur iPhone.</p><button type="button" class="dt-lien" data-copier>Copier le lien</button>';
    }
    m.innerHTML='<div class="dt-aide-boite">'+h+'<button type="button" class="dt-lien" data-fermer>Fermer</button></div>';
  }
  remplir();aideOuverte=remplir;
  m.addEventListener('click',function(e){
    if(e.target===m||e.target.closest('[data-fermer]')){fermerAide();return}
    if(e.target.closest('[data-copier]')){
      var url=lienPropre();
      if(navigator.clipboard)navigator.clipboard.writeText(url).then(function(){DT.toast('Lien copié')},function(){DT.toast(url,true)});else DT.toast(url,true);
    }
  });
  document.body.appendChild(m);
  var f=m.querySelector('[data-installer],a,button');if(f)f.focus();
}
// Styles communs du bloc d'installation et de la fenêtre d'aide
(function(){
  var css='.dt-inst{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:16px;background:linear-gradient(135deg,rgba(242,169,59,.14),rgba(194,80,42,.10));border:1px solid rgba(242,169,59,.42);text-align:left}'+
  '.dt-inst-txt{flex:1;min-width:0}.dt-inst-txt b{display:block;font-weight:600;color:var(--sable,#EFE6D8)}.dt-inst-txt span{display:block;color:var(--brume,#9AAEA2);font-size:.84rem;margin-top:2px}'+
  '.dt-inst-act{display:grid;gap:4px;justify-items:center;flex:none}'+
  '.dt-inst-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:999px;border:1px solid transparent;background:var(--ambre,#F2A93B);color:var(--nuit,#0D1A15);font:inherit;font-weight:700;font-size:.95rem;cursor:pointer;text-decoration:none;white-space:nowrap}'+
  '.dt-inst-btn.dt-plein{width:100%;min-height:54px;font-size:1.02rem}.dt-inst-btn.dt-ligne{width:100%;background:transparent;border-color:rgba(239,230,216,.28);color:var(--sable,#EFE6D8)}'+
  '.dt-inst-tard{background:none;border:0;color:var(--brume,#9AAEA2);font:inherit;font-size:.8rem;cursor:pointer;padding:2px 4px;text-decoration:underline;text-underline-offset:2px}'+
  '.dt-aide{position:fixed;inset:0;z-index:90;display:grid;place-items:end center;background:rgba(5,10,8,.78);padding:16px}'+
  '@media (min-width:640px){.dt-aide{place-items:center}}'+
  '.dt-aide-boite{width:100%;max-width:420px;max-height:calc(100vh - 32px);overflow:auto;background:var(--nuit-2,#14261F);border:1px solid rgba(239,230,216,.12);border-radius:22px;padding:22px;display:grid;gap:14px;color:var(--sable,#EFE6D8);font-family:var(--texte,"Familjen Grotesk",Arial,sans-serif);line-height:1.45}'+
  '.dt-aide-boite h2{font-family:var(--display,"Big Shoulders Display",sans-serif);font-weight:800;font-size:1.7rem;line-height:1;margin:0}.dt-aide-boite p{margin:0}'+
  '.dt-etapes{margin:0;padding:0;list-style:none;counter-reset:e;display:grid;gap:10px}'+
  '.dt-etapes li{counter-increment:e;display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px;align-items:center}'+
  '.dt-etapes li::before{content:counter(e);width:30px;height:30px;border-radius:50%;background:rgba(242,169,59,.16);color:var(--ambre,#F2A93B);font-weight:700;display:grid;place-items:center}'+
  '.dt-petit{color:var(--brume,#9AAEA2);font-size:.86rem}'+
  '.dt-lien{background:none;border:0;color:var(--brume,#9AAEA2);font:inherit;min-height:42px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}';
  var s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s);
})();
// Travailleur hors ligne : chargement rapide et application installable
var swPret=null;
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){
  swPret=new Promise(function(ok){
    var go=function(){navigator.serviceWorker.register('sw.js').then(function(){return navigator.serviceWorker.ready}).then(ok,function(){ok(null)})};
    if(document.readyState==='complete')go();else window.addEventListener('load',go);
  });
}

/* ---------- Notifications (téléphone verrouillé) ---------- */
DT.VAPID='BBtM60hkgu4R1JJqOhtwrFWeTOEZ6DmB0vfC91G0k-bhkhS7ywLXf5DWr8utkrkGaeYGMok3pkjqwxDnfsydM80';
DT.APK='https://github.com/Sipion007/dallas-trak-pro/releases/latest/download/dallas-trak-pro.apk';
// Application Android Dallas Trak Pro : la page tourne à l'intérieur, le téléphone gère la sonnerie
DT.pro=!!(window.DTPro&&typeof window.DTPro.demarrer==='function');
DT.proEtat=function(){if(!DT.pro)return null;try{return JSON.parse(window.DTPro.etat())}catch(e){return null}};
function cleServeur(){
  var s=DT.VAPID.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';
  var t=atob(s),b=new Uint8Array(t.length);for(var i=0;i<t.length;i++)b[i]=t.charCodeAt(i);return b;
}
function b64u(buf){var b=new Uint8Array(buf),s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
// pro | indisponible | ios-installer | refusee | active | a-activer
DT.notifEtat=function(){
  if(DT.pro)return 'pro';
  var p=DT.plateforme();
  if((p==='ios'||p==='ios-autre'||p==='integre-ios')&&!DT.installee())return 'ios-installer';
  if(!swPret||!('PushManager' in window)||!('Notification' in window))return 'indisponible';
  if(Notification.permission==='denied')return 'refusee';
  if(Notification.permission==='granted'){try{return localStorage.getItem('dt-notifs')==='1'?'active':'a-activer'}catch(e){return 'a-activer'}}
  return 'a-activer';
};
// Abonne ce téléphone. demander=true seulement après un geste de la personne (bouton, interrupteur).
DT.activerNotifs=function(sb,demander){
  var e=DT.notifEtat();
  if(e==='pro'||e==='indisponible'||e==='ios-installer'||e==='refusee')return Promise.resolve(e);
  var perm=Notification.permission;
  if(perm!=='granted'&&!demander)return Promise.resolve('a-activer');
  var p=perm==='granted'?Promise.resolve('granted'):new Promise(function(ok){var r=Notification.requestPermission(ok);if(r&&r.then)r.then(ok)});
  return p.then(function(res){
    if(res!=='granted')return Notification.permission==='denied'?'refusee':'a-activer';
    return swPret.then(function(reg){
      if(!reg||!reg.pushManager)return 'indisponible';
      return reg.pushManager.getSubscription().then(function(s){
        return s||reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:cleServeur()});
      }).then(function(s){
        return DT.appel(sb.rpc('dt_push_abonner',{p_endpoint:s.endpoint,p_p256dh:b64u(s.getKey('p256dh')),p_auth:b64u(s.getKey('auth'))}));
      }).then(function(){try{localStorage.setItem('dt-notifs','1')}catch(x){}DT.surNotifs.forEach(function(f){try{f()}catch(x){}});return 'active'});
    });
  }).catch(function(){return 'a-activer'});
};
// À la déconnexion : ce téléphone ne reçoit plus les messages de ce compte
DT.desactiverNotifs=function(sb){
  try{localStorage.removeItem('dt-notifs')}catch(x){}
  if(!swPret)return Promise.resolve();
  var fini=new Promise(function(ok){setTimeout(ok,2500)});
  return Promise.race([fini,swPret.then(function(reg){
    if(!reg||!reg.pushManager)return;
    return reg.pushManager.getSubscription().then(function(s){
      if(!s)return;
      return Promise.resolve(sb.rpc('dt_push_desabonner',{p_endpoint:s.endpoint})).catch(function(){}).then(function(){return s.unsubscribe()});
    });
  }).catch(function(){})]);
};
DT.surNotifs=[];
// Messages du travailleur : une notification vient d'arriver pendant que la page est ouverte
DT.surPush=function(f){
  if(!('serviceWorker' in navigator))return;
  navigator.serviceWorker.addEventListener('message',function(e){if(e.data&&e.data.dt==='push')f(e.data.msg||{})});
};
// Encart d'état des notifications
DT.blocNotifs=function(espace){
  var e=DT.notifEtat(),chauf=espace==='chauffeur';
  var quoi=chauf?'les demandes de course':'l’arrivée de votre chauffeur',deQuoi=chauf?'des demandes de course':'de l’arrivée de votre chauffeur';
  if(e==='pro'||e==='indisponible')return '';
  if(e==='active')return '<p class="dt-notif-ok">Notifications activées : vous êtes prévenu '+deQuoi+', même téléphone verrouillé.</p>';
  var h='<div class="dt-notif"><b>'+(chauf?'Recevez les courses téléphone verrouillé':'Soyez prévenu téléphone verrouillé')+'</b>';
  if(e==='ios-installer')h+='<span>Sur iPhone, installez d’abord l’application sur l’écran d’accueil, puis ouvrez-la depuis son icône pour activer les notifications.</span><button type="button" class="dt-inst-btn" data-installer>Installer l’application</button>';
  else if(e==='refusee')h+='<span>Les notifications sont bloquées. Ouvrez les réglages du téléphone, puis Applications, Chrome (ou Dallas Trak), Notifications, et autorisez-les pour Dallas Trak.</span>';
  else h+='<span>Une notification avec vibration vous signale '+quoi+', même l’écran éteint dans la poche.</span><button type="button" class="dt-inst-btn" data-notifs>Activer les notifications</button>';
  return h+'</div>';
};
// Promotion de l'application Android Pro (chauffeurs sur Android, hors application Pro)
DT.blocPro=function(){
  var p=DT.plateforme();
  if(DT.pro||(p!=='android'&&p!=='integre'))return '';
  return '<div class="dt-pro"><div><b>Dallas Trak Pro pour Android</b><span>Sonnerie forte comme un appel, écran qui s’allume tout seul, position envoyée même téléphone en poche.</span></div>'+
    '<a class="dt-inst-btn" href="'+DT.APK+'" data-pro-apk>Télécharger</a></div>';
};
(function(){
  var css='.dt-notif{display:grid;gap:8px;padding:14px 16px;border-radius:16px;background:rgba(94,154,110,.10);border:1px solid rgba(94,154,110,.4);text-align:left}'+
  '.dt-notif b{font-weight:600}.dt-notif span{color:var(--brume,#9AAEA2);font-size:.86rem}.dt-notif .dt-inst-btn{justify-self:start;background:var(--feuille,#5E9A6E)}'+
  '.dt-notif-ok{margin:0;color:#8FCB9E;font-size:.86rem}'+
  '.dt-pro{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:16px;background:var(--nuit-3,#1C3229);border:1px solid rgba(239,230,216,.16);text-align:left}'+
  '.dt-pro>div{flex:1;min-width:0}.dt-pro b{display:block;font-weight:600}.dt-pro span{display:block;color:var(--brume,#9AAEA2);font-size:.84rem;margin-top:2px}';
  var s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s);
})();

window.DT=DT;
})();
