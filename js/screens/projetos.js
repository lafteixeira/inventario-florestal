import * as db from '../db.js';
import { exportarBackup, exportarBackupDaFazenda, importarBackupDeArquivo } from '../export.js';
import { confirmar } from '../confirmacao.js';
import { VERSAO } from '../versao.js';
import { verificarAtualizacoes, aplicarAtualizacao, temAtualizacaoDisponivel } from '../atualizacao.js';

export async function initProjetos(container, { onAbrirProjeto }) {
  const ctx = {
    container,
    onAbrirProjeto,
    mostrandoForm: false,
    statusAtualizacao: temAtualizacaoDisponivel() ? 'disponivel' : null,
  };
  await render(ctx);
}

async function render(ctx) {
  const fazendas = await db.listarFazendas();
  const cartoes = await Promise.all(fazendas.map(cartaoProjeto));

  ctx.container.innerHTML = `
    <section class="painel">
      <h2>Projetos</h2>

      <div class="acoes">
        <button type="button" id="btn-novo-projeto">Criar novo projeto</button>
      </div>

      ${ctx.mostrandoForm ? formularioNovoProjeto() : ''}

      <div id="lista-projetos">
        ${fazendas.length === 0 ? '<p>Nenhum projeto cadastrado ainda.</p>' : cartoes.join('')}
      </div>

      <h3>Backup geral</h3>
      <p class="ajuda">Exporta ou restaura todos os projetos de uma vez (uso ao trocar de aparelho).</p>
      <div class="acoes">
        <button type="button" id="btn-exportar-tudo">Exportar backup completo</button>
        <label class="botao-arquivo">
          Importar backup completo
          <input id="input-importar-tudo" type="file" accept="application/json" hidden>
        </label>
      </div>

      <h3>Sobre o app</h3>
      <p class="versao-app">Inventário Florestal · versão ${VERSAO}</p>
      ${renderStatusAtualizacao(ctx)}
    </section>
  `;

  ligarEventos(ctx);
}

function renderStatusAtualizacao(ctx) {
  if (ctx.statusAtualizacao === 'disponivel') {
    return `
      <p class="ajuda">Uma versão nova já foi baixada e está pronta.</p>
      <div class="acoes">
        <button type="button" id="btn-aplicar-atualizacao">Atualizar agora</button>
      </div>
    `;
  }
  if (ctx.statusAtualizacao === 'verificando') {
    return `<p class="ajuda">Verificando...</p>`;
  }
  if (ctx.statusAtualizacao === 'atualizado') {
    return `
      <p class="ajuda">Você já está na versão mais recente.</p>
      <div class="acoes"><button type="button" id="btn-verificar-atualizacoes">Verificar de novo</button></div>
    `;
  }
  if (ctx.statusAtualizacao === 'offline') {
    return `
      <p class="ajuda">Não foi possível verificar agora (sem conexão?).</p>
      <div class="acoes"><button type="button" id="btn-verificar-atualizacoes">Tentar de novo</button></div>
    `;
  }
  return `
    <p class="ajuda">A atualização nunca acontece sozinha — só quando você pedir aqui.</p>
    <div class="acoes"><button type="button" id="btn-verificar-atualizacoes">Verificar atualizações</button></div>
  `;
}

async function cartaoProjeto(fazenda) {
  const talhoes = await db.getTalhoesDaFazenda(fazenda.id);
  const localizacao = [fazenda.municipio, fazenda.uf].filter(Boolean).join(' - ');
  return `
    <div class="cartao-projeto" data-id="${fazenda.id}">
      <h3>${fazenda.nome}</h3>
      ${localizacao ? `<p class="detalhes-projeto">${localizacao}</p>` : ''}
      ${fazenda.contratante ? `<p class="detalhes-projeto">Contratante: ${fazenda.contratante}</p>` : ''}
      <p class="detalhes-projeto">${talhoes.length} talhão(ões)</p>
      <div class="acoes">
        <button type="button" class="btn-abrir-projeto" data-id="${fazenda.id}">Abrir</button>
        <button type="button" class="btn-exportar-projeto" data-id="${fazenda.id}">Exportar</button>
        <button type="button" class="btn-apagar-projeto btn-perigo" data-id="${fazenda.id}" data-nome="${fazenda.nome}">Apagar</button>
      </div>
    </div>
  `;
}

function formularioNovoProjeto() {
  return `
    <form id="form-novo-projeto" class="painel-form">
      <label>Nome da fazenda <input id="f-nome" type="text" required placeholder="ex: Fazenda Ibítira"></label>
      <div class="linha-campos">
        <label>Município <input id="f-municipio" type="text"></label>
        <label>UF <input id="f-uf" type="text" maxlength="2"></label>
      </div>
      <label>Contratante/Cliente <input id="f-contratante" type="text"></label>
      <label>Endereço <input id="f-endereco" type="text"></label>
      <label>Responsável técnico <input id="f-responsavel" type="text"></label>
      <div class="acoes">
        <button type="submit">Criar projeto</button>
        <button type="button" id="btn-cancelar-novo-projeto">Cancelar</button>
      </div>
    </form>
  `;
}

function ligarEventos(ctx) {
  const $ = (sel) => ctx.container.querySelector(sel);

  $('#btn-novo-projeto').addEventListener('click', () => {
    ctx.mostrandoForm = true;
    render(ctx);
  });

  const formNovo = $('#form-novo-projeto');
  if (formNovo) {
    $('#btn-cancelar-novo-projeto').addEventListener('click', () => {
      ctx.mostrandoForm = false;
      render(ctx);
    });

    formNovo.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = $('#f-nome').value.trim();
      if (!nome) return;
      const fazenda = await db.criarFazenda({
        nome,
        municipio: $('#f-municipio').value.trim(),
        uf: $('#f-uf').value.trim().toUpperCase(),
        contratante: $('#f-contratante').value.trim(),
        endereco: $('#f-endereco').value.trim(),
        responsavelTecnico: $('#f-responsavel').value.trim(),
      });
      ctx.onAbrirProjeto(fazenda);
    });
  }

  ctx.container.querySelectorAll('.btn-abrir-projeto').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fazenda = await db.getFazenda(btn.dataset.id);
      ctx.onAbrirProjeto(fazenda);
    });
  });

  ctx.container.querySelectorAll('.btn-exportar-projeto').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fazenda = await db.getFazenda(btn.dataset.id);
      await exportarBackupDaFazenda(fazenda);
    });
  });

  ctx.container.querySelectorAll('.btn-apagar-projeto').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const ok = await confirmar(
        `Apagar o projeto "${btn.dataset.nome}"? Todos os talhões, parcelas e medições dele serão perdidos. Essa ação não pode ser desfeita.`
      );
      if (!ok) return;
      await db.excluirFazenda(id);
      render(ctx);
    });
  });

  $('#btn-exportar-tudo').addEventListener('click', () => exportarBackup());

  $('#input-importar-tudo').addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    const ok = await confirmar(
      'Importar este backup vai SUBSTITUIR todos os projetos e dados atuais do aparelho. Continuar?',
      { confirmarTexto: 'Importar' }
    );
    if (!ok) return;
    await importarBackupDeArquivo(arquivo);
    ctx.mostrandoForm = false;
    render(ctx);
  });

  $('#btn-verificar-atualizacoes')?.addEventListener('click', async () => {
    ctx.statusAtualizacao = 'verificando';
    render(ctx);
    const resultado = await verificarAtualizacoes();
    if (!resultado.suportado) {
      ctx.statusAtualizacao = 'atualizado'; // navegador sem suporte a SW — não há o que oferecer
    } else if (resultado.offline) {
      ctx.statusAtualizacao = 'offline';
    } else {
      ctx.statusAtualizacao = resultado.disponivel ? 'disponivel' : 'atualizado';
    }
    render(ctx);
  });

  $('#btn-aplicar-atualizacao')?.addEventListener('click', () => {
    aplicarAtualizacao();
  });
}
