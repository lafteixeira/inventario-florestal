const DB_NAME = 'inventario-florestal';
const DB_VERSION = 2;

let dbPromise = null;

function gerarId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function abrirDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const tx = req.transaction;

      if (!db.objectStoreNames.contains('fazendas')) {
        db.createObjectStore('fazendas', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('talhoes')) {
        const talhoes = db.createObjectStore('talhoes', { keyPath: 'id' });
        talhoes.createIndex('fazendaId', 'fazendaId');
        talhoes.createIndex('numero', 'numero');
      }
      if (!db.objectStoreNames.contains('parcelas')) {
        const parcelas = db.createObjectStore('parcelas', { keyPath: 'id' });
        parcelas.createIndex('talhaoId', 'talhaoId');
        parcelas.createIndex('numero', 'numero');
        parcelas.createIndex('fazendaId', 'fazendaId');
      }
      if (!db.objectStoreNames.contains('medicoes')) {
        const medicoes = db.createObjectStore('medicoes', { keyPath: 'id', autoIncrement: true });
        medicoes.createIndex('parcelaId', 'parcelaId');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'chave' });
      }

      // Migração v1 -> v2: parcelas criadas antes de existir suporte a múltiplos
      // projetos não têm fazendaId — preenche a partir do talhão de cada uma.
      const parcelasStore = tx.objectStore('parcelas');
      if (!parcelasStore.indexNames.contains('fazendaId')) {
        parcelasStore.createIndex('fazendaId', 'fazendaId');
      }
      const talhoesStore = tx.objectStore('talhoes');
      parcelasStore.openCursor().onsuccess = (ev) => {
        const cursor = ev.target.result;
        if (!cursor) return;
        const parcela = cursor.value;
        if (parcela.fazendaId == null) {
          const getTalhao = talhoesStore.get(parcela.talhaoId);
          getTalhao.onsuccess = () => {
            const talhao = getTalhao.result;
            if (talhao) {
              parcela.fazendaId = talhao.fazendaId;
              cursor.update(parcela);
            }
            cursor.continue();
          };
        } else {
          cursor.continue();
        }
      };
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, storeNames, modo) {
  return db.transaction(storeNames, modo);
}

function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function maiorNumero(itens) {
  if (itens.length === 0) return null;
  return itens.reduce((a, b) => (a.numero > b.numero ? a : b));
}

// ---------- meta (estado de sessão: qual projeto está aberto) ----------

export async function getMeta() {
  const db = await abrirDB();
  const t = tx(db, ['meta'], 'readonly');
  const registro = await reqAsPromise(t.objectStore('meta').get('estado'));
  return registro || {};
}

export async function setMeta(parcial) {
  const db = await abrirDB();
  const atual = await getMeta();
  const novo = { chave: 'estado', ...atual, ...parcial };
  const t = tx(db, ['meta'], 'readwrite');
  t.objectStore('meta').put(novo);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(novo);
    t.onerror = () => reject(t.error);
  });
}

// ---------- fazendas (projetos) ----------

export async function getFazenda(id) {
  const db = await abrirDB();
  const t = tx(db, ['fazendas'], 'readonly');
  return reqAsPromise(t.objectStore('fazendas').get(id));
}

export async function listarFazendas() {
  const db = await abrirDB();
  const t = tx(db, ['fazendas'], 'readonly');
  const todas = await reqAsPromise(t.objectStore('fazendas').getAll());
  return todas.sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
}

export async function criarFazenda({ nome, municipio, uf, contratante, endereco, responsavelTecnico }) {
  const db = await abrirDB();
  const fazenda = {
    id: gerarId(),
    nome,
    municipio: municipio || null,
    uf: uf || null,
    contratante: contratante || null,
    endereco: endereco || null,
    responsavelTecnico: responsavelTecnico || null,
    criadoEm: new Date().toISOString(),
  };
  const t = tx(db, ['fazendas'], 'readwrite');
  t.objectStore('fazendas').add(fazenda);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(fazenda);
    t.onerror = () => reject(t.error);
  });
}

// Apaga o projeto inteiro: talhões, parcelas e medições. Irreversível.
export async function excluirFazenda(fazendaId) {
  const talhoes = await getTalhoesDaFazenda(fazendaId);
  const talhaoIds = talhoes.map((t) => t.id);
  let parcelaIds = [];
  for (const talhaoId of talhaoIds) {
    const parcelas = await getParcelasDoTalhao(talhaoId);
    parcelaIds = parcelaIds.concat(parcelas.map((p) => p.id));
  }
  let medicaoIds = [];
  for (const parcelaId of parcelaIds) {
    const medicoes = await getMedicoesDaParcela(parcelaId);
    medicaoIds = medicaoIds.concat(medicoes.map((m) => m.id));
  }
  const meta = await getMeta();

  const db = await abrirDB();
  const t = tx(db, ['fazendas', 'talhoes', 'parcelas', 'medicoes', 'meta'], 'readwrite');
  medicaoIds.forEach((id) => t.objectStore('medicoes').delete(id));
  parcelaIds.forEach((id) => t.objectStore('parcelas').delete(id));
  talhaoIds.forEach((id) => t.objectStore('talhoes').delete(id));
  t.objectStore('fazendas').delete(fazendaId);
  if (meta.fazendaAtualId === fazendaId) {
    t.objectStore('meta').delete('estado');
  }
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ---------- talhões ----------

export async function getTalhao(id) {
  const db = await abrirDB();
  const t = tx(db, ['talhoes'], 'readonly');
  return reqAsPromise(t.objectStore('talhoes').get(id));
}

export async function getTalhoesDaFazenda(fazendaId) {
  const db = await abrirDB();
  const t = tx(db, ['talhoes'], 'readonly');
  const todos = await reqAsPromise(t.objectStore('talhoes').index('fazendaId').getAll(fazendaId));
  return todos.sort((a, b) => a.numero - b.numero);
}

export async function getProximoNumeroTalhao(fazendaId) {
  const todos = await getTalhoesDaFazenda(fazendaId);
  const maior = maiorNumero(todos);
  return maior ? maior.numero + 1 : 1;
}

// Talhão "em andamento" da fazenda (o de maior número com status em_andamento), ou null.
export async function getTalhaoEmAndamento(fazendaId) {
  const todos = await getTalhoesDaFazenda(fazendaId);
  return maiorNumero(todos.filter((t) => t.status === 'em_andamento'));
}

export async function criarTalhao(fazendaId, cadastro = {}) {
  const db = await abrirDB();
  const numero = await getProximoNumeroTalhao(fazendaId);
  const talhao = {
    id: gerarId(),
    fazendaId,
    numero,
    status: 'em_andamento',
    dataInicio: new Date().toISOString(),
    dataConclusao: null,
    nome: cadastro.nome || null,
    area: cadastro.area ?? null,
    materialGenetico: cadastro.materialGenetico || null,
    espacamento: cadastro.espacamento || null,
    regimeSilvicultural: cadastro.regimeSilvicultural || null,
    dataPlantio: cadastro.dataPlantio || null,
    rotacao: cadastro.rotacao || null,
    observacoes: cadastro.observacoes || null,
  };
  const t = tx(db, ['talhoes'], 'readwrite');
  t.objectStore('talhoes').add(talhao);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(talhao);
    t.onerror = () => reject(t.error);
  });
}

export async function atualizarCadastroTalhao(talhaoId, cadastro) {
  const db = await abrirDB();
  const t = tx(db, ['talhoes'], 'readwrite');
  const store = t.objectStore('talhoes');
  const talhao = await reqAsPromise(store.get(talhaoId));
  talhao.nome = cadastro.nome || null;
  talhao.area = cadastro.area ?? null;
  talhao.materialGenetico = cadastro.materialGenetico || null;
  talhao.espacamento = cadastro.espacamento || null;
  talhao.regimeSilvicultural = cadastro.regimeSilvicultural || null;
  talhao.dataPlantio = cadastro.dataPlantio || null;
  talhao.rotacao = cadastro.rotacao || null;
  talhao.observacoes = cadastro.observacoes || null;
  store.put(talhao);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(talhao);
    t.onerror = () => reject(t.error);
  });
}

export async function concluirTalhao(talhaoId) {
  const db = await abrirDB();
  const t = tx(db, ['talhoes', 'parcelas'], 'readwrite');
  const talhoesStore = t.objectStore('talhoes');
  const parcelasStore = t.objectStore('parcelas');

  const talhao = await reqAsPromise(talhoesStore.get(talhaoId));
  talhao.status = 'concluido';
  talhao.dataConclusao = new Date().toISOString();
  talhoesStore.put(talhao);

  const parcelasDoTalhao = await reqAsPromise(
    parcelasStore.index('talhaoId').getAll(talhaoId)
  );
  for (const p of parcelasDoTalhao) {
    if (p.status !== 'concluida') {
      p.status = 'concluida';
      parcelasStore.put(p);
    }
  }

  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(talhao);
    t.onerror = () => reject(t.error);
  });
}

// Apaga o talhão, suas parcelas e todas as medições delas. Irreversível.
export async function excluirTalhao(talhaoId) {
  const parcelas = await getParcelasDoTalhao(talhaoId);
  const parcelaIds = parcelas.map((p) => p.id);
  let medicaoIds = [];
  for (const parcelaId of parcelaIds) {
    const medicoes = await getMedicoesDaParcela(parcelaId);
    medicaoIds = medicaoIds.concat(medicoes.map((m) => m.id));
  }

  const db = await abrirDB();
  const t = tx(db, ['talhoes', 'parcelas', 'medicoes'], 'readwrite');
  medicaoIds.forEach((id) => t.objectStore('medicoes').delete(id));
  parcelaIds.forEach((id) => t.objectStore('parcelas').delete(id));
  t.objectStore('talhoes').delete(talhaoId);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ---------- parcelas ----------

function calcularArea(forma, comprimento, largura, raio) {
  if (forma === 'circular') return Math.PI * raio * raio;
  return comprimento * largura;
}

export async function getParcela(id) {
  const db = await abrirDB();
  const t = tx(db, ['parcelas'], 'readonly');
  return reqAsPromise(t.objectStore('parcelas').get(id));
}

async function getParcelasDaFazenda(fazendaId) {
  const db = await abrirDB();
  const t = tx(db, ['parcelas'], 'readonly');
  return reqAsPromise(t.objectStore('parcelas').index('fazendaId').getAll(fazendaId));
}

export async function getProximoNumeroParcela(fazendaId) {
  const todas = await getParcelasDaFazenda(fazendaId);
  const maior = maiorNumero(todas);
  return maior ? maior.numero + 1 : 1;
}

export async function getUltimaParcelaCriada(fazendaId) {
  const todas = await getParcelasDaFazenda(fazendaId);
  return maiorNumero(todas);
}

export async function getParcelasDoTalhao(talhaoId) {
  const db = await abrirDB();
  const t = tx(db, ['parcelas'], 'readonly');
  const todas = await reqAsPromise(t.objectStore('parcelas').index('talhaoId').getAll(talhaoId));
  return todas.sort((a, b) => a.numero - b.numero);
}

// Parcela "em andamento" do talhão (a de maior número com status em_andamento), ou null.
export async function getParcelaEmAndamento(talhaoId) {
  const todas = await getParcelasDoTalhao(talhaoId);
  return maiorNumero(todas.filter((p) => p.status === 'em_andamento'));
}

export async function criarParcela(talhaoId, { forma, comprimento, largura, raio }) {
  const db = await abrirDB();
  const talhao = await getTalhao(talhaoId);
  const numero = await getProximoNumeroParcela(talhao.fazendaId);
  const parcela = {
    id: gerarId(),
    talhaoId,
    fazendaId: talhao.fazendaId,
    numero,
    forma,
    comprimento: comprimento ?? null,
    largura: largura ?? null,
    raio: raio ?? null,
    area: calcularArea(forma, comprimento, largura, raio),
    status: 'em_andamento',
  };
  const t = tx(db, ['parcelas'], 'readwrite');
  t.objectStore('parcelas').add(parcela);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(parcela);
    t.onerror = () => reject(t.error);
  });
}

export async function atualizarConfigParcela(parcelaId, { forma, comprimento, largura, raio }) {
  const db = await abrirDB();
  const t = tx(db, ['parcelas'], 'readwrite');
  const store = t.objectStore('parcelas');
  const parcela = await reqAsPromise(store.get(parcelaId));
  parcela.forma = forma;
  parcela.comprimento = comprimento ?? null;
  parcela.largura = largura ?? null;
  parcela.raio = raio ?? null;
  parcela.area = calcularArea(forma, comprimento, largura, raio);
  store.put(parcela);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(parcela);
    t.onerror = () => reject(t.error);
  });
}

export async function finalizarParcela(parcelaId) {
  const db = await abrirDB();
  const t = tx(db, ['parcelas'], 'readwrite');
  const store = t.objectStore('parcelas');
  const parcela = await reqAsPromise(store.get(parcelaId));
  parcela.status = 'concluida';
  store.put(parcela);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(parcela);
    t.onerror = () => reject(t.error);
  });
}

// Apaga a parcela e todas as suas medições. Irreversível.
export async function excluirParcela(parcelaId) {
  const medicoes = await getMedicoesDaParcela(parcelaId);
  const db = await abrirDB();
  const t = tx(db, ['parcelas', 'medicoes'], 'readwrite');
  medicoes.forEach((m) => t.objectStore('medicoes').delete(m.id));
  t.objectStore('parcelas').delete(parcelaId);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ---------- medições ----------

export async function getMedicoesDaParcela(parcelaId) {
  const db = await abrirDB();
  const t = tx(db, ['medicoes'], 'readonly');
  return reqAsPromise(t.objectStore('medicoes').index('parcelaId').getAll(parcelaId));
}

export async function getUltimaMedicaoDaParcela(parcelaId) {
  const medicoes = await getMedicoesDaParcela(parcelaId);
  if (medicoes.length === 0) return null;
  return medicoes.reduce((a, b) => (a.id > b.id ? a : b));
}

export async function addMedicao(medicao) {
  const db = await abrirDB();
  const registro = { ...medicao, timestamp: new Date().toISOString() };
  const t = tx(db, ['medicoes'], 'readwrite');
  const req = t.objectStore('medicoes').add(registro);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve({ ...registro, id: req.result });
    t.onerror = () => reject(t.error);
  });
}

export async function desfazerUltimaMedicao(parcelaId) {
  const ultima = await getUltimaMedicaoDaParcela(parcelaId);
  if (!ultima) return null;
  const db = await abrirDB();
  const t = tx(db, ['medicoes'], 'readwrite');
  t.objectStore('medicoes').delete(ultima.id);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(ultima);
    t.onerror = () => reject(t.error);
  });
}

export async function getTodasMedicoes() {
  const db = await abrirDB();
  const t = tx(db, ['medicoes'], 'readonly');
  return reqAsPromise(t.objectStore('medicoes').getAll());
}

export async function getMedicoesDoTalhao(talhaoId) {
  const parcelas = await getParcelasDoTalhao(talhaoId);
  const grupos = await Promise.all(parcelas.map((p) => getMedicoesDaParcela(p.id)));
  return grupos.flat();
}

export async function atualizarMedicao(id, { linha, arvore, cap, altura, qualidade }) {
  const db = await abrirDB();
  const t = tx(db, ['medicoes'], 'readwrite');
  const store = t.objectStore('medicoes');
  const medicao = await reqAsPromise(store.get(id));
  const falha = cap === 0 || qualidade === 5;
  medicao.linha = linha;
  medicao.arvore = arvore;
  medicao.cap = falha ? 0 : cap;
  medicao.altura = falha ? null : altura;
  medicao.qualidade = falha ? 5 : qualidade;
  medicao.falha = falha;
  store.put(medicao);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(medicao);
    t.onerror = () => reject(t.error);
  });
}

export async function excluirMedicao(id) {
  const db = await abrirDB();
  const t = tx(db, ['medicoes'], 'readwrite');
  t.objectStore('medicoes').delete(id);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// ---------- backup (usado por export.js) ----------

export async function getTudo() {
  const db = await abrirDB();
  const nomes = ['fazendas', 'talhoes', 'parcelas', 'medicoes'];
  const t = tx(db, nomes, 'readonly');
  const dados = {};
  for (const nome of nomes) {
    dados[nome] = await reqAsPromise(t.objectStore(nome).getAll());
  }
  return dados;
}

export async function getTudoDaFazenda(fazendaId) {
  const fazenda = await getFazenda(fazendaId);
  const talhoes = await getTalhoesDaFazenda(fazendaId);
  const parcelas = [];
  const medicoes = [];
  for (const talhao of talhoes) {
    const parcelasDoTalhao = await getParcelasDoTalhao(talhao.id);
    for (const parcela of parcelasDoTalhao) {
      parcelas.push(parcela);
      medicoes.push(...(await getMedicoesDaParcela(parcela.id)));
    }
  }
  return { fazendas: fazenda ? [fazenda] : [], talhoes, parcelas, medicoes };
}

export async function restaurarTudo(dados) {
  const db = await abrirDB();
  const nomes = ['fazendas', 'talhoes', 'parcelas', 'medicoes', 'meta'];
  const t = tx(db, nomes, 'readwrite');
  for (const nome of ['fazendas', 'talhoes', 'parcelas', 'medicoes', 'meta']) {
    t.objectStore(nome).clear();
  }
  for (const nome of ['fazendas', 'talhoes', 'parcelas', 'medicoes']) {
    for (const item of dados[nome] || []) {
      t.objectStore(nome).put(item);
    }
  }
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
