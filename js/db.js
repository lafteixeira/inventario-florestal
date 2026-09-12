const DB_NAME = 'inventario-florestal';
const DB_VERSION = 1;

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
      }
      if (!db.objectStoreNames.contains('medicoes')) {
        const medicoes = db.createObjectStore('medicoes', { keyPath: 'id', autoIncrement: true });
        medicoes.createIndex('parcelaId', 'parcelaId');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'chave' });
      }
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

// ---------- meta (estado de sessão: talhão/parcela em andamento) ----------

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

// ---------- fazendas ----------

export async function getFazendaAtual() {
  const db = await abrirDB();
  const t = tx(db, ['fazendas'], 'readonly');
  const todas = await reqAsPromise(t.objectStore('fazendas').getAll());
  return todas[0] || null;
}

export async function criarFazenda(nome) {
  const db = await abrirDB();
  const fazenda = { id: gerarId(), nome };
  const t = tx(db, ['fazendas'], 'readwrite');
  t.objectStore('fazendas').add(fazenda);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(fazenda);
    t.onerror = () => reject(t.error);
  });
}

// ---------- talhões ----------

export async function getTalhao(id) {
  const db = await abrirDB();
  const t = tx(db, ['talhoes'], 'readonly');
  return reqAsPromise(t.objectStore('talhoes').get(id));
}

async function getTodosTalhoes(db) {
  const t = tx(db, ['talhoes'], 'readonly');
  return reqAsPromise(t.objectStore('talhoes').getAll());
}

export async function getProximoNumeroTalhao() {
  const db = await abrirDB();
  const todos = await getTodosTalhoes(db);
  if (todos.length === 0) return 1;
  return Math.max(...todos.map((t) => t.numero)) + 1;
}

export async function getTalhoesDaFazenda(fazendaId) {
  const db = await abrirDB();
  const t = tx(db, ['talhoes'], 'readonly');
  const todos = await reqAsPromise(t.objectStore('talhoes').index('fazendaId').getAll(fazendaId));
  return todos.sort((a, b) => a.numero - b.numero);
}

export async function criarTalhao(fazendaId) {
  const db = await abrirDB();
  const numero = await getProximoNumeroTalhao();
  const talhao = {
    id: gerarId(),
    fazendaId,
    numero,
    status: 'em_andamento',
    dataInicio: new Date().toISOString(),
    dataConclusao: null,
  };
  const t = tx(db, ['talhoes'], 'readwrite');
  t.objectStore('talhoes').add(talhao);
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

async function getTodasParcelas(db) {
  const t = tx(db, ['parcelas'], 'readonly');
  return reqAsPromise(t.objectStore('parcelas').getAll());
}

export async function getProximoNumeroParcela() {
  const db = await abrirDB();
  const todas = await getTodasParcelas(db);
  if (todas.length === 0) return 1;
  return Math.max(...todas.map((p) => p.numero)) + 1;
}

export async function getUltimaParcelaCriada() {
  const db = await abrirDB();
  const todas = await getTodasParcelas(db);
  if (todas.length === 0) return null;
  return todas.reduce((a, b) => (a.numero > b.numero ? a : b));
}

export async function getParcelasDoTalhao(talhaoId) {
  const db = await abrirDB();
  const t = tx(db, ['parcelas'], 'readonly');
  const todas = await reqAsPromise(t.objectStore('parcelas').index('talhaoId').getAll(talhaoId));
  return todas.sort((a, b) => a.numero - b.numero);
}

export async function criarParcela(talhaoId, { forma, comprimento, largura, raio }) {
  const db = await abrirDB();
  const numero = await getProximoNumeroParcela();
  const parcela = {
    id: gerarId(),
    talhaoId,
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

// ---------- backup completo (usado por export.js) ----------

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
