/**
 * Injects an inline script at the very start of the document that redirects
 * signup confirmation (Supabase tokens in hash) to /set-password before any
 * other script runs. This runs before React/Expo, so it catches the redirect
 * even if the main bundle loads slowly or the hash is lost during SPA init.
 */
const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(distPath)) {
  console.warn('[patch-auth-redirect] dist/index.html not found, skipping');
  process.exit(0);
}

const script = `<script id="patch-auth-redirect-injected">
(function(){
  var h=window.location.hash||'',s=window.location.search||'',hp=h?h.substring(1):'',sp=s?s.substring(1):'';
  var host=window.location.hostname||'',p=(window.location.pathname||'/').replace(/\\/$/,'')||'/';
  var canon=(host==='www.learnadoodle.com'||host==='learnadoodle.com')?'https://learnadoodle.com':window.location.origin;
  try{
    var hp2=new URLSearchParams(hp),sp2=new URLSearchParams(sp);
    var at=hp2.get('access_token')||sp2.get('access_token'),ty=hp2.get('type')||sp2.get('type');
    var frag=h||(s?'#'+sp:'');
    if(at&&(ty==='email'||ty==='signup')&&p!=='/set-password'){
      try{sessionStorage.setItem('learnadoodle_needs_password_set','true');}catch(e){}
      window.location.replace(canon+'/set-password'+frag);
    }else if(host==='www.learnadoodle.com'&&h&&p==='/set-password'){
      window.location.replace(canon+'/set-password'+h);
    }
  }catch(e){}
})();
</script>
`;

let html = fs.readFileSync(distPath, 'utf8');

// Avoid double-injection
if (html.includes('patch-auth-redirect-injected')) {
  console.log('[patch-auth-redirect] Already patched, skipping');
  process.exit(0);
}

// Inject right after <head> so it runs before any other script
if (!/<head[^>]*>/i.test(html)) {
  console.warn('[patch-auth-redirect] No <head> found, skipping');
  process.exit(0);
}

html = html.replace(/(<head[^>]*>)/i, '$1\n' + script);
fs.writeFileSync(distPath, html);
console.log('[patch-auth-redirect] Injected signup confirmation redirect script');
