// Migration script (v2.1): account UI hooks, cloud build flag. Throws if a target is already gone.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function patch(file, pairs) { const p = path.join(root, file); let s = fs.readFileSync(p, 'utf8'); for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(file + ' missing: ' + a.slice(0, 80)); s = s.replace(a, b); } fs.writeFileSync(p, s); }

// build: optional cloud flag -> meta tag + Identity widget
patch('build.js', [
  ["const scriptTag = `<script>\\nconst PLENTY_VERSION='${version}';\\n${js}\\n</script>\\n`;", "const CLOUD = process.env.PLENTY_CLOUD === 'netlify' ? 'netlify' : '';\nconst scriptTag = `<script>\\nconst PLENTY_VERSION='${version}';\\n${js}\\n</script>\\n`;"],
  ["<link rel=\"apple-touch-icon\" href=\"./icons/apple-touch-icon.png\">\n${headLinks.join('\\n')}", "<link rel=\"apple-touch-icon\" href=\"./icons/apple-touch-icon.png\">\n${CLOUD ? '<meta name=\"plenty-cloud\" content=\"netlify\">\\n<script src=\"https://identity.netlify.com/v1/netlify-identity-widget.js\" defer></script>' : ''}\n${headLinks.join('\\n')}"],
  ["console.log(`Built dist/ (${version}) from ${parts.length} parts; ${html.length} bytes; precache ${precache.length} files`);", "console.log(`Built dist/ (${version}${CLOUD ? ', cloud: netlify' : ', local-only'}) from ${parts.length} parts; ${html.length} bytes; precache ${precache.length} files`);"],
]);
// settings: account card first
patch('src/4-views2.js', [["  <div class=\"grid2\">\n    ${profileCardHtml()}", "  <div class=\"grid2\">\n    ${typeof accountCardHtml==='function'?accountCardHtml():''}\n    ${profileCardHtml()}"]]);
// receipt photo modal: account controls
patch('src/9-discover-ui.js', [["<div class=\"mb\"><img src=\"${url}\" alt=\"Receipt\" style=\"max-width:100%;border-radius:8px\"></div>", "<div class=\"mb\"><img src=\"${url}\" alt=\"Receipt\" style=\"max-width:100%;border-radius:8px\">${typeof accountPhotoControlsHtml==='function'?accountPhotoControlsHtml(tr):''}</div>"]]);
// actions
patch('src/7-events-starter.js', [["    case 'pwa-update':applyUpdate();break;", "    case 'pwa-update':applyUpdate();break;\n    case 'acct-login':if(window.netlifyIdentity)window.netlifyIdentity.open('login');else toast('The sign-in service is not available on this page.');break;\n    case 'acct-manage':if(window.netlifyIdentity)window.netlifyIdentity.open();break;\n    case 'acct-logout':if(window.netlifyIdentity)window.netlifyIdentity.logout();break;\n    case 'acct-import':openAccountImport();break;\n    case 'acct-restore':openAccountRestore();break;\n    case 'acct-export':accountExportDownload();break;\n    case 'acct-delete':openAccountDelete();break;\n    case 'acct-delete-health':confirmModal('Delete health data from your account?','Removes the health profile and check-ins stored in the account. Local data on this device is not affected.','Delete from account',async()=>{try{await api('health-data',{method:'DELETE'});await loadCloudProfile();toast('Health data removed from your account')}catch(e){toast(cloudErr(e))}},true);break;\n    case 'acct-delete-prices':confirmModal('Delete price history from your account?','Removes remembered prices and product mappings stored in the account.','Delete from account',async()=>{try{const r=await api('health-data?what=prices',{method:'DELETE'});await loadCloudProfile();toast(`${r.count} price records removed from your account`)}catch(e){toast(cloudErr(e))}},true);break;\n    case 'acct-photo-upload':closeModal();uploadTripPhotoToAccount(d.id);break;\n    case 'acct-photo-remove':closeModal();removeTripPhotoFromAccount(d.id);break;"]]);
console.log('wired netlify');
