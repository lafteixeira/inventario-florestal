import * as db from './db.js';

function dimensoes(parcela) {
  return {
    forma: parcela.forma,
    comprimento: parcela.comprimento,
    largura: parcela.largura,
    raio: parcela.raio,
  };
}

// Talhão e parcela "atuais" do projeto (os em andamento); cria o que faltar,
// já com as dimensões da última parcela pré-preenchidas.
export async function garantirTalhaoEParcela(fazenda) {
  let talhao = await db.getTalhaoEmAndamento(fazenda.id);
  if (!talhao) talhao = await db.criarTalhao(fazenda.id);

  let parcela = await db.getParcelaEmAndamento(talhao.id);
  if (!parcela) {
    const ultima = await db.getUltimaParcelaCriada(fazenda.id);
    parcela = await db.criarParcela(
      talhao.id,
      ultima ? dimensoes(ultima) : { forma: 'retangular', comprimento: null, largura: null, raio: null }
    );
  }
  return { talhao, parcela };
}

export async function finalizarEAbrirProxima(talhao, parcela) {
  await db.finalizarParcela(parcela.id);
  return db.criarParcela(talhao.id, dimensoes(parcela));
}

// O talhão novo já nasce com o que costuma se repetir entre talhões do mesmo
// projeto (material, espaçamento, regime, plantio, rotação); nome, área e
// observações ficam em branco por serem específicos de cada talhão.
export async function concluirEAbrirNovoTalhao(fazendaId, talhao, parcela) {
  await db.finalizarParcela(parcela.id);
  await db.concluirTalhao(talhao.id);
  const novoTalhao = await db.criarTalhao(fazendaId, {
    materialGenetico: talhao.materialGenetico,
    espacamento: talhao.espacamento,
    regimeSilvicultural: talhao.regimeSilvicultural,
    dataPlantio: talhao.dataPlantio,
    rotacao: talhao.rotacao,
  });
  const novaParcela = await db.criarParcela(novoTalhao.id, dimensoes(parcela));
  return { talhao: novoTalhao, parcela: novaParcela };
}
