// app.js - 구글 Gemini 연동 24시간 모바일 주식 쇼츠 AI 비서 (파일 업로드 & 날짜 정렬 지원)

const STORAGE_KEY_API = 'stock_shorts_gemini_api_key';
const STORAGE_KEY_WATCHLIST = 'stock_shorts_watchlist_items';

// 기본 더미 초기 관심종목 데이터 (날짜 포함)
const DEFAULT_WATCHLIST = [
  { name: '산일전기', code: '062040', memo: '변압기 수주 호황 및 실적 모멘텀', date: '2026-10-19' },
  { name: 'LS ELECTRIC', code: '010120', memo: '북미 전력 인프라 확대 수혜', date: '2026-10-19' },
  { name: '우리넷', code: '115440', memo: '양자암호통신 및 5G 모듈', date: '2026-10-18' }
];

let currentAnalysis = null;
let currentUploadedFile = null;
let currentUploadedBase64 = null; // 이미지 또는 캡처 프레임의 Base64

// ==========================================
// 1. 초기화 및 이벤트 리스너
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSubTabs();
  initFileUpload();
  initModals();
  initWatchlist();
  initPWA();

  // API 키가 없으면 설정 모달 자동 팝업
  if (!getApiKey()) {
    showSettingsModal();
  }

  // 붙여넣기 버튼
  document.getElementById('btnPaste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        document.getElementById('videoUrlInput').value = text.trim();
      }
    } catch (err) {
      alert('클립보드 읽기 권한을 허용해 주시거나 직접 링크를 길게 눌러 붙여넣으세요.');
    }
  });

  // 분석 버튼
  document.getElementById('btnAnalyze').addEventListener('click', handleAnalyze);

  // 관심종목 추가 버튼
  document.getElementById('btnAddToWatchlist').addEventListener('click', handleAddAnalyzedStock);

  // 리포트 복사 버튼
  document.getElementById('btnCopyReport').addEventListener('click', handleCopyReport);

  // 정렬 셀렉터 변경
  document.getElementById('sortOrderSelect').addEventListener('change', () => {
    renderWatchlist();
  });
});

// ==========================================
// 2. 탭 제어 (메인 & 서브 탭)
// ==========================================
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
    });
  });
}

function initSubTabs() {
  const subLink = document.getElementById('subTabLink');
  const subFile = document.getElementById('subTabFile');
  const secLink = document.getElementById('inputLinkSection');
  const secFile = document.getElementById('inputFileSection');

  subLink.addEventListener('click', () => {
    subLink.classList.add('active');
    subFile.classList.remove('active');
    secLink.classList.remove('hidden');
    secFile.classList.add('hidden');
  });

  subFile.addEventListener('click', () => {
    subFile.classList.add('active');
    subLink.classList.remove('active');
    secFile.classList.remove('hidden');
    secLink.classList.add('hidden');
  });
}

// ==========================================
// 3. 파일 업로드 (영상 및 이미지) 제어
// ==========================================
function initFileUpload() {
  const fileInput = document.getElementById('mediaFileInput');
  const dropZone = document.getElementById('dropZone');
  const dropContent = document.getElementById('dropContent');
  const previewContainer = document.getElementById('previewContainer');
  const imagePreview = document.getElementById('imagePreview');
  const videoPreview = document.getElementById('videoPreview');
  const fileInfoText = document.getElementById('fileInfoText');
  const btnRemove = document.getElementById('btnRemoveFile');

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFileSelected(file);
  });

  btnRemove.addEventListener('click', (e) => {
    e.stopPropagation();
    clearUploadedFile();
  });

  // 드래그앤드롭 이벤트
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    if (file) handleFileSelected(file);
  });

  function handleFileSelected(file) {
    currentUploadedFile = file;
    dropContent.classList.add('hidden');
    previewContainer.classList.remove('hidden');
    fileInfoText.innerText = `선택된 파일: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;

    if (file.type.startsWith('image/')) {
      // 이미지 파일 처리
      videoPreview.classList.add('hidden');
      imagePreview.classList.remove('hidden');

      const reader = new FileReader();
      reader.onload = (event) => {
        imagePreview.src = event.target.result;
        // Base64 추출 (앞의 data:image/...;base64, 제거)
        currentUploadedBase64 = event.target.result.split(',')[1];
      };
      reader.readAsDataURL(file);

    } else if (file.type.startsWith('video/')) {
      // 비디오 파일 처리
      imagePreview.classList.add('hidden');
      videoPreview.classList.remove('hidden');

      const videoUrl = URL.createObjectURL(file);
      videoPreview.src = videoUrl;

      // 비디오 대표 프레임 자동 캔버스 캡처
      videoPreview.onloadeddata = () => {
        videoPreview.currentTime = Math.min(2.0, (videoPreview.duration || 4) / 2);
      };

      videoPreview.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = videoPreview.videoWidth || 640;
          canvas.height = videoPreview.videoHeight || 360;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(videoPreview, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          currentUploadedBase64 = dataUrl.split(',')[1];
        } catch (err) {
          console.warn('비디오 캡처 오류:', err);
        }
      };
    }
  }

  function clearUploadedFile() {
    currentUploadedFile = null;
    currentUploadedBase64 = null;
    fileInput.value = '';
    imagePreview.src = '';
    videoPreview.src = '';
    dropContent.classList.remove('hidden');
    previewContainer.classList.add('hidden');
  }
}

// ==========================================
// 4. 모달 제어
// ==========================================
function initModals() {
  const settingsModal = document.getElementById('settingsModal');
  const addModal = document.getElementById('addModal');

  document.getElementById('btnSettings').addEventListener('click', showSettingsModal);
  document.getElementById('btnCloseModal').addEventListener('click', () => settingsModal.classList.add('hidden'));

  document.getElementById('btnOpenAddModal').addEventListener('click', () => {
    document.getElementById('addStockName').value = '';
    document.getElementById('addStockCode').value = '';
    document.getElementById('addStockMemo').value = '';
    addModal.classList.remove('hidden');
  });
  document.getElementById('btnCloseAddModal').addEventListener('click', () => addModal.classList.add('hidden'));

  document.getElementById('btnSaveKey').addEventListener('click', () => {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (key) {
      localStorage.setItem(STORAGE_KEY_API, key);
      settingsModal.classList.add('hidden');
      alert('✅ 구글 Gemini API 키가 성공적으로 저장되었습니다!');
    } else {
      alert('API 키를 입력해 주세요.');
    }
  });

  document.getElementById('btnConfirmAddStock').addEventListener('click', () => {
    const name = document.getElementById('addStockName').value.trim();
    const code = document.getElementById('addStockCode').value.trim();
    const memo = document.getElementById('addStockMemo').value.trim();

    if (!name) {
      alert('종목명을 입력해 주세요.');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    addStockToStorage({ name, code: code || '000000', memo: memo || '직접 추가됨', date: todayStr });
    addModal.classList.add('hidden');
    renderWatchlist();
  });
}

function showSettingsModal() {
  const input = document.getElementById('apiKeyInput');
  input.value = getApiKey() || '';
  document.getElementById('settingsModal').classList.remove('hidden');
}

function getApiKey() {
  return localStorage.getItem(STORAGE_KEY_API) || '';
}

// ==========================================
// 5. 구글 Gemini API 호출 (링크 & 파일 하이브리드)
// ==========================================
async function handleAnalyze() {
  const isLinkMode = document.getElementById('subTabLink').classList.contains('active');
  const url = document.getElementById('videoUrlInput').value.trim();

  if (isLinkMode && !url) {
    alert('틱톡(TikTok) 또는 유튜브 쇼츠 링크를 먼저 입력해 주세요.');
    return;
  }

  if (!isLinkMode && (!currentUploadedFile || !currentUploadedBase64)) {
    alert('분석할 이미지나 동영상 파일을 먼저 선택해 주세요.');
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    alert('구글 Gemini API 키가 필요합니다. 설정창에서 먼저 무료 키를 등록해 주세요.');
    showSettingsModal();
    return;
  }

  const loadingBox = document.getElementById('loadingBox');
  const resultCard = document.getElementById('resultCard');

  loadingBox.classList.remove('hidden');
  resultCard.classList.add('hidden');

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const systemPrompt = `
당신은 대한민국 최고 수준의 전문 주식 리서치 애널리스트입니다.
제공된 주식 영상/이미지(차트, 호가창, 쇼츠 캡처본) 또는 링크 정보를 분석하여 주식 투자에 꼭 필요한 정보를 도출하세요.
화면에 표시된 캔들 차트, 텍스트 자막, 종목코드, 날짜, 지지/저항선을 꼼꼼히 확인하고 반드시 아래 순수 JSON 형식으로만 응답하세요. (마크다운 코드블록 제외)

JSON 스키마:
{
  "date": "YYYY-MM-DD (영상/화면 속 날짜 또는 ${todayStr})",
  "stock_name": "대표 종목명",
  "stock_code": "6자리 공식 종목코드",
  "trading_type": "단기스윙 / 단타 / 중장기 / 테마주 중 1개",
  "sentiment": "긍정·매수 / 중립·관망 / 매도·주의 중 1개",
  "summary_3lines": [
    "1. 첫 번째 핵심 모멘텀/호재 요약",
    "2. 두 번째 차트/수급/가격대 요약",
    "3. 세 번째 화자의 매매 전략 및 결론 요약"
  ],
  "support": "지지선 가격 (예: 72,000원 또는 미제시)",
  "resistance": "저항선 가격 (예: 78,000원 또는 미제시)",
  "target": "목표가 (예: 85,000원 또는 미제시)",
  "stop_loss": "손절선 (예: 70,000원 또는 미제시)"
}
`;

    // 요청 파트 구성
    const parts = [];
    parts.push({ text: systemPrompt });

    if (isLinkMode) {
      parts.push({ text: `분석할 주식 쇼츠 영상 링크: ${url}\n오늘 날짜: ${todayStr}\n위 링크의 주식 핵심 내용을 완벽히 요약해 주세요.` });
    } else {
      // 이미지 또는 비디오 프레임 Base64 첨부
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: currentUploadedBase64
        }
      });
      parts.push({ text: `첨부된 주식 차트/영상 화면을 정밀 분석하여 종목명과 핵심 투자 전략을 도출해 주세요. 오늘 날짜: ${todayStr}` });
    }

    // 모델 후보군 (1순위: 최신 gemini-3.8-flash)
    const modelCandidates = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
    let lastError = null;
    let data = null;

    for (const model of modelCandidates) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: parts }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json'
            }
          })
        });

        if (response.ok) {
          data = await response.json();
          break;
        } else {
          const errData = await response.json().catch(() => ({}));
          lastError = new Error(errData.error?.message || `HTTP ${response.status}`);
          if (errData.error?.message?.includes('no longer available') || errData.error?.message?.includes('not found')) {
            console.warn(`[모델 폴백] ${model} 실패, 다음 시도...`);
            continue;
          } else {
            throw lastError;
          }
        }
      } catch (e) {
        lastError = e;
      }
    }

    if (!data) {
      throw lastError || new Error('Gemini API 호출에 실패했습니다.');
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('AI 응답을 받지 못했습니다.');

    const parsed = JSON.parse(rawText);
    currentAnalysis = parsed;
    renderAnalysisResult(parsed);

  } catch (err) {
    console.error(err);
    alert(`[분석 오류] ${err.message}\nAPI 키나 파일을 확인해 주세요.`);
  } finally {
    loadingBox.classList.add('hidden');
  }
}

// 결과 렌더링
function renderAnalysisResult(res) {
  const resultCard = document.getElementById('resultCard');

  document.getElementById('resDateBadge').innerText = `📅 ${res.date || '오늘'}`;
  document.getElementById('resTypeBadge').innerText = res.trading_type || '스윙';
  
  const sentBadge = document.getElementById('resSentimentBadge');
  sentBadge.innerText = res.sentiment || '긍정';
  sentBadge.className = 'badge ' + (res.sentiment?.includes('매수') || res.sentiment?.includes('긍정') ? 'badge-buy' : 'badge-sell');

  document.getElementById('resStockTitle').innerText = `${res.stock_name} (${res.stock_code})`;

  const listEl = document.getElementById('resSummaryList');
  listEl.innerHTML = '';
  (res.summary_3lines || []).forEach(line => {
    const li = document.createElement('li');
    li.innerText = `• ${line}`;
    listEl.appendChild(li);
  });

  document.getElementById('resSupport').innerText = res.support || '미제시';
  document.getElementById('resResistance').innerText = res.resistance || '미제시';
  document.getElementById('resTarget').innerText = res.target || '미제시';
  document.getElementById('resStopLoss').innerText = res.stop_loss || '미제시';

  resultCard.classList.remove('hidden');
}

// 분석된 종목을 관심종목에 추가
function handleAddAnalyzedStock() {
  if (!currentAnalysis) return;
  const item = {
    name: currentAnalysis.stock_name,
    code: currentAnalysis.stock_code,
    memo: currentAnalysis.summary_3lines?.[0] || '쇼츠 AI 추천',
    date: currentAnalysis.date || new Date().toISOString().split('T')[0]
  };
  addStockToStorage(item);
  renderWatchlist();
  alert(`✅ '${item.name}' 종목이 ${item.date} 일자로 관심종목에 등록되었습니다!`);
}

// 리포트 복사
function handleCopyReport() {
  if (!currentAnalysis) return;
  const text = `[주식 쇼츠 AI 요약] ${currentAnalysis.stock_name}(${currentAnalysis.stock_code})
- 일자: ${currentAnalysis.date} | 관점: ${currentAnalysis.sentiment}
- 핵심요약:
${currentAnalysis.summary_3lines?.map(s => '• ' + s).join('\n')}
- 가격대: 지지 ${currentAnalysis.support} / 목표 ${currentAnalysis.target} / 손절 ${currentAnalysis.stop_loss}`;

  navigator.clipboard.writeText(text).then(() => {
    alert('📋 분석 리포트가 클립보드에 복사되었습니다.');
  });
}

// ==========================================
// 6. 관심종목 관리 및 날짜별 정렬 (LocalStorage)
// ==========================================
function initWatchlist() {
  const saved = localStorage.getItem(STORAGE_KEY_WATCHLIST);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(DEFAULT_WATCHLIST));
  }
  renderWatchlist();
}

function getWatchlist() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_WATCHLIST)) || [];
    // 기존 데이터에 date가 없는 경우 기본값 부여
    list.forEach(item => {
      if (!item.date) item.date = '2026-10-19';
    });
    return list;
  } catch {
    return [];
  }
}

function addStockToStorage(item) {
  const list = getWatchlist();
  if (!item.date) item.date = new Date().toISOString().split('T')[0];
  const filtered = list.filter(s => s.name !== item.name);
  filtered.unshift(item);
  localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(filtered));
}

function deleteStockFromStorage(name) {
  const list = getWatchlist().filter(s => s.name !== name);
  localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(list));
  renderWatchlist();
}

function renderWatchlist() {
  let list = getWatchlist();
  document.getElementById('stockCount').innerText = list.length;
  const container = document.getElementById('watchlistContainer');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:#6b7280; padding:20px;">등록된 관심종목이 없습니다.</p>`;
    return;
  }

  // 사용자가 선택한 정렬 방식 적용
  const sortMode = document.getElementById('sortOrderSelect')?.value || 'dateDesc';
  if (sortMode === 'dateDesc') {
    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } else if (sortMode === 'dateAsc') {
    list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  } else if (sortMode === 'nameAsc') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  // 날짜별 그룹핑 렌더링
  let lastDate = null;
  list.forEach(item => {
    const itemDate = item.date || '날짜 미상';
    
    // 날짜가 바뀔 때마다 날짜 그룹 헤더 표시 (날짜순 정렬 시)
    if (sortMode.startsWith('date') && itemDate !== lastDate) {
      const header = document.createElement('div');
      header.className = 'date-group-header';
      header.innerHTML = `📅 <span>${itemDate}</span>`;
      container.appendChild(header);
      lastDate = itemDate;
    }

    const card = document.createElement('div');
    card.className = 'stock-card';
    card.innerHTML = `
      <div class="stock-info">
        <h4>${item.name} <span style="font-size:0.8rem; color:#9ca3af;">(${item.code})</span></h4>
        <p>${item.memo || '쇼츠 AI 추천 종목'}</p>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="badge badge-date" style="font-size:0.72rem;">${itemDate}</span>
        <button class="stock-del-btn" title="삭제">&times;</button>
      </div>
    `;
    card.querySelector('.stock-del-btn').addEventListener('click', () => {
      if (confirm(`'${item.name}' 종목을 삭제하시겠습니까?`)) {
        deleteStockFromStorage(item.name);
      }
    });
    container.appendChild(card);
  });
}

// ==========================================
// 7. PWA 서비스 워커 등록
// ==========================================
function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('Service Worker 등록 실패:', err);
      });
    });
  }
}
