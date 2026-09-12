import { getTudo, restaurarTudo } from './db.js';

export async function exportarBackup() {
  const dados = await getTudo();
  const payload = {
    versao: 1,
    exportadoEm: new Date().toISOString(),
    ...dados,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = `backup-inventario-${carimbo}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importarBackupDeArquivo(file) {
  const texto = await file.text();
  const dados = JSON.parse(texto);
  if (!dados || !Array.isArray(dados.medicoes)) {
    throw new Error('Arquivo de backup inválido.');
  }
  await restaurarTudo(dados);
}
