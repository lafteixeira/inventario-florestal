import { getTudo, getTudoDaFazenda, restaurarTudo } from './db.js';

function slug(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function baixarJson(nomeArquivo, dados) {
  const payload = {
    versao: 1,
    exportadoEm: new Date().toISOString(),
    ...dados,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportarBackup() {
  const dados = await getTudo();
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  baixarJson(`backup-inventario-${carimbo}.json`, dados);
}

export async function exportarBackupDaFazenda(fazenda) {
  const dados = await getTudoDaFazenda(fazenda.id);
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  baixarJson(`backup-${slug(fazenda.nome) || 'projeto'}-${carimbo}.json`, dados);
}

export async function importarBackupDeArquivo(file) {
  const texto = await file.text();
  const dados = JSON.parse(texto);
  if (!dados || !Array.isArray(dados.medicoes)) {
    throw new Error('Arquivo de backup inválido.');
  }
  await restaurarTudo(dados);
}
