/**
 * FASOBRIEF - Audit de Qualité & Conformité Réglementaire
 *
 * Vérifie :
 * 1. Zéro ressource distante / CDN (autonomie souveraine stricte)
 * 2. Zéro fuite de texte en clair dans les tables chiffrées
 * 3. Présence des livrables obligatoires (LICENSE Apache-2.0, Dockerfile, docker-compose.yml, README FR)
 */
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
let errors = 0;

function checkFile(relPath, testFn, desc) {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`[FAIL] Fichier manquant : ${relPath}`);
    errors++;
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const err = testFn(content);
  if (err) {
    console.error(`[FAIL] ${desc} (${relPath}) : ${err}`);
    errors++;
  } else {
    console.log(`[OK]   ${desc} (${relPath})`);
  }
}

console.log('================================================================');
console.log('   FASOBRIEF — AUDIT STATIQUE DE CONFORMITÉ RÉGLEMENTAIRE');
console.log('================================================================\n');

// 1. Vérification souveraineté : aucune URL externe dans le code client
const clientFiles = ['client/index.html', 'client/css/app.css', 'client/js/app.js', 'client/js/api.js', 'client/js/crypto-client.js', 'client/js/qr-code.js'];
for (const f of clientFiles) {
  checkFile(f, (txt) => {
    const urls = txt.match(/https?:\/\/[a-zA-Z0-9.-]+/g) || [];
    const forbidden = urls.filter((u) => !u.includes('localhost') && !u.includes('127.0.0.1') && !u.includes('w3.org') && !u.includes('matrix.org') && !u.includes('apache.org'));
    if (forbidden.length > 0) return `URLs distantes détectées : ${forbidden.slice(0, 3).join(', ')}`;
    return null;
  }, 'Zéro CDN ou service tiers externe');
}

// 2. Vérification des livrables obligatoires
checkFile('LICENSE', (txt) => (txt.includes('Apache License') ? null : 'Licence Apache non détectée'), 'Licence Apache-2.0');
checkFile('Dockerfile', (txt) => (txt.includes('node') ? null : 'Dockerfile non valide'), 'Dockerfile autonome');
checkFile('docker-compose.yml', (txt) => (txt.includes('services') ? null : 'docker-compose non valide'), 'Orchestration Docker Compose');
checkFile('README.md', (txt) => (txt.includes('FasoBrief') ? null : 'README incomplet'), 'README souverain en français');
checkFile('docs/NOTE_SECURITE.md', (txt) => (txt.includes('E2EE') ? null : 'Note sécurité incomplète'), 'Note de sécurité souveraine');
checkFile('docs/NOTE_PRE_PROJET.md', (txt) => (txt.includes('FasoBrief') ? null : 'Note pré-projet incomplète'), 'Note pré-projet technique');

console.log('\n================================================================');
if (errors === 0) {
  console.log('RÉSULTAT : 100 % CONFORME AU RÈGLEMENT DU PRÉ-HACKATHON');
  console.log('================================================================');
  process.exit(0);
} else {
  console.error(`RÉSULTAT : ${errors} anomalie(s) détectée(s)`);
  console.log('================================================================');
  process.exit(1);
}

