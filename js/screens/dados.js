import { exportarBackup, exportarBackupDaFazenda, importarBackupDeArquivo, slug } from '../export.js';
import {
  gerarCsvMedicoes,
  gerarCsvEstatisticasParcelas,
  gerarCsvEstatisticasTalhoes,
  baixarCsv,
} from '../reports.js';
import { confirmar } from '../confirmacao.js';

// Tudo que entra e sai do app: salvar (backup), exportar (relatórios) e importar.
export async function initDados(container, fazenda) {
  container.innerHTML = `
    <section class="painel">
      <h2>Dados</h2>

      <h3>Salvar</h3>
      <p class="ajuda">Guarde uma cópia fora do aparelho (WhatsApp, e-mail, Drive) ao fim de cada dia de campo.</p>
      <div class="acoes-empilhadas">
        <button type="button" id="btn-salvar-projeto">Salvar backup deste projeto</button>
        <button type="button" id="btn-salvar-tudo" class="btn-secundario">Backup de todos os projetos</button>
      </div>

      <h3>Exportar relatórios (CSV)</h3>
      <div class="acoes-empilhadas">
        <button type="button" id="btn-csv-medicoes" class="btn-secundario">Medições</button>
        <button type="button" id="btn-csv-parcelas" class="btn-secundario">Estatísticas por parcela</button>
        <button type="button" id="btn-csv-talhoes" class="btn-secundario">Estatísticas por talhão</button>
      </div>

      <h3>Importar</h3>
      <p class="ajuda">Restaura um backup. Substitui todos os projetos e dados atuais deste aparelho.</p>
      <label class="botao-arquivo">
        Importar backup
        <input id="input-importar" type="file" accept="application/json" hidden>
      </label>
    </section>
  `;

  const $ = (sel) => container.querySelector(sel);
  const base = slug(fazenda.nome) || 'fazenda';
  const hoje = new Date().toISOString().slice(0, 10);

  $('#btn-salvar-projeto').addEventListener('click', () => exportarBackupDaFazenda(fazenda));
  $('#btn-salvar-tudo').addEventListener('click', () => exportarBackup());

  $('#btn-csv-medicoes').addEventListener('click', async () => {
    baixarCsv(`medicoes-${base}-${hoje}.csv`, await gerarCsvMedicoes(fazenda));
  });
  $('#btn-csv-parcelas').addEventListener('click', async () => {
    baixarCsv(`estatisticas-parcelas-${base}-${hoje}.csv`, await gerarCsvEstatisticasParcelas(fazenda));
  });
  $('#btn-csv-talhoes').addEventListener('click', async () => {
    baixarCsv(`estatisticas-talhoes-${base}-${hoje}.csv`, await gerarCsvEstatisticasTalhoes(fazenda));
  });

  $('#input-importar').addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    const ok = await confirmar(
      'Importar este backup vai SUBSTITUIR todos os projetos e dados atuais do aparelho. Continuar?',
      { confirmarTexto: 'Importar' }
    );
    if (!ok) {
      e.target.value = '';
      return;
    }
    try {
      await importarBackupDeArquivo(arquivo);
    } catch (erro) {
      await confirmar(`Não foi possível importar: ${erro.message}`, { confirmarTexto: 'OK', cancelarTexto: 'Fechar', perigo: false });
      return;
    }
    window.location.reload();
  });
}
