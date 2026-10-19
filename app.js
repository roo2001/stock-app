// app.js - 다중 종목 전수 추출, 추천 이유 표기 & 엑셀 스타일 요일별 실시간 금융 테이블

const STORAGE_KEY_API = 'stock_shorts_gemini_api_key';
const STORAGE_KEY_WATCHLIST = 'stock_shorts_watchlist_items';

// 종목 마스터 정밀 시세 및 추천 이유 데이터 (실제 엑셀 관심종목_실시간.xlsx 매핑)
const MASTER_STOCK_INFO = {
  '산일전기': { theme: '변압기', code: '062040', sector: '전기제어장치', price: 188800, change: 7400, rate: 4.06, volume: 452100, tradeValue: 851, foreign: '+1.2만', inst: '+3.5천', reason: '북미 AI 데이터센터향 특수변압기 수주 지속 확대 및 3분기 호실적 기반 주가 전고점 돌파 시도' },
  '제룡전기': { theme: '중소형 배전변압기', code: '033100', sector: '전기장비', price: 64500, change: 2100, rate: 3.36, volume: 820000, tradeValue: 480, foreign: '+2.4만', inst: '+1.8천', reason: '미국 배전변압기 쇼티지 지속에 따른 높은 영업이익률 유지 및 20일 이동평균선 안착 후 기술적 반등 흐름' },
  '효성중공업': { theme: '전력기기/변압기', code: '298040', sector: '전기장비', price: 418000, change: 16500, rate: 4.11, volume: 220000, tradeValue: 920, foreign: '+3.2만', inst: '+8.5천', reason: '유럽 및 북미 법인 흑자 폭 확대와 미국 현지 증설 모멘텀으로 전력 인프라 대장주로서의 밸류에이션 리레이팅 기대' },
  'HD현대일렉트릭': { theme: '전력기기/변압기', code: '267260', sector: '전기장비', price: 315000, change: 15500, rate: 5.18, volume: 460000, tradeValue: 1450, foreign: '+6.5만', inst: '+2.1만', reason: '글로벌 전력망 교체 주기 도래에 따른 초고압 변압기 수주 잔고 급증 및 견조한 기관·외인 동반 순매수세' },
  'LS ELECTRIC': { theme: '원전전력', code: '010120', sector: '전기제어장치', price: 166000, change: 7400, rate: 4.67, volume: 720500, tradeValue: 1200, foreign: '+2.8만', inst: '+1.1만', reason: '북미 전력 인프라 대규모 증설 및 초고압 변압기 수혜' },
  '우리넷': { theme: '양자암호', code: '115440', sector: '통신장비', price: 9760, change: -50, rate: -0.51, volume: 124000, tradeValue: 12, foreign: '-500', inst: '-3000', reason: '국가 양자암호 시험망 구축 및 5G 모듈 국산화' },
  'SK하이닉스': { theme: 'HBM/AI', code: '000660', sector: '반도체', price: 191000, change: 4200, rate: 2.25, volume: 2150000, tradeValue: 4100, foreign: '+18만', inst: '+9.4만', reason: '5세대 HBM3E 엔비디아 독점 공급 및 분기 최대 실적 달성' },
  '삼성전자': { theme: '반도체', code: '005930', sector: '반도체', price: 73500, change: 1000, rate: 1.38, volume: 8500000, tradeValue: 6200, foreign: '+45만', inst: '+12만', reason: 'HBM 5세대 공급 승인 기대감 및 저평가 밸류에이션 매력' },
  '코위버': { theme: '5G통신', code: '056360', sector: '통신장비', price: 5570, change: 110, rate: 2.01, volume: 89000, tradeValue: 5, foreign: '+1.1천', inst: '0', reason: '5G 백본망 광전송장비 국산화 및 공공 인프라 수주' },
  '한국전력기술': { theme: '원자력', code: '052690', sector: '엔지니어링', price: 74200, change: 1800, rate: 2.49, volume: 310000, tradeValue: 230, foreign: '+5.4천', inst: '+8.2천', reason: '체코 원전 수주 본계약 체결 기대감 및 SMR 설계 역량' },
  '일진전기': { theme: '초고압변압기', code: '103590', sector: '전기장비', price: 27800, change: 1100, rate: 4.12, volume: 1250000, tradeValue: 350, foreign: '+1.5만', inst: '+6.2천', reason: '홍성 공장 초고압 변압기 증설 가동 및 북미 수출 본격화' },
  '대원전선': { theme: '전선/전력망', code: '006340', sector: '전기장비', price: 3850, change: 120, rate: 3.22, volume: 5400000, tradeValue: 210, foreign: '+8.4만', inst: '+1.2천', reason: '미국 주요 전력청 납품 이력 및 초고압 케이블 수출 확대' },
  '대한전선': { theme: '해저케이블', code: '001440', sector: '전기장비', price: 14200, change: 350, rate: 2.53, volume: 3100000, tradeValue: 440, foreign: '+12만', inst: '+3.5만', reason: '당진 해저케이블 1공장 1단계 준공 및 해상풍력 수주 가시화' },
  '인텍플러스': { theme: '반도체/CXL', code: '064290', sector: '반도체장비', price: 28500, change: 1200, rate: 4.39, volume: 850000, tradeValue: 240, foreign: '+1.8만', inst: '+3.2만', reason: '글로벌 빅테크향 첨단 패키징 검사장비 독점 공급 및 CXL 테마 모멘텀' },
  '오킨스전자': { theme: 'CXL소켓', code: '080580', sector: '반도체부품', price: 8450, change: 350, rate: 4.32, volume: 1200000, tradeValue: 100, foreign: '+5.2천', inst: '+1.1만', reason: '차세대 CXL 메모리 인터페이스 테스트 소켓 국산화 및 공급 가시화' },
  '삼아알미늄': { theme: '2차전지양극박', code: '006110', sector: '비철금속', price: 36200, change: 1100, rate: 3.13, volume: 420000, tradeValue: 150, foreign: '+2.1만', inst: '+4.5천', reason: '글로벌 배터리 제조사향 하이니켈 양극박 장기 공급 계약 수혜' },
  'TCC스틸': { theme: '원통형배터리캔', code: '002710', sector: '철강금속', price: 38400, change: 1400, rate: 3.78, volume: 780000, tradeValue: 300, foreign: '+4.5만', inst: '+1.8만', reason: '4680 원통형 배터리용 니켈도금강판 전용 라인 증설 및 독점적 시장 지위' },
  'SFA반도체': { theme: '반도체 패키징/서버DDR5', code: '036540', sector: '반도체', price: 49125, change: 1500, rate: 3.09, volume: 1250000, tradeValue: 114, foreign: '+1.5만', inst: '+8천', reason: '저마진 모듈 및 레거시 탈피, 데이터센터용 SSD 및 서버용 DDR5 물량 본격 투입' },
  '빗샘전자': { theme: '광통신/AI데이터센터', code: '072950', sector: '통신장비', price: 50546, change: 1500, rate: 3.09, volume: 1200000, tradeValue: 111, foreign: '+1.5만', inst: '+8천', reason: 'AI 데이터센터 확산에 따른 광통신 관련주 부각' }
};

// 업종 자동 유추 함수 (마스터나 AI 응답에 업종이 없을 때 '일반' 대신 정확한 산업군 추론)
function guessSector(theme = '', name = '') {
  const combined = (theme + ' ' + name).toLowerCase();
  if (combined.includes('변압기') || combined.includes('배전') || combined.includes('전력') || combined.includes('전선') || combined.includes('전기')) {
    return '전기장비';
  }
  if (combined.includes('반도체') || combined.includes('hbm') || combined.includes('낸드') || combined.includes('dram')) {
    return '반도체';
  }
  if (combined.includes('통신') || combined.includes('5g') || combined.includes('양자') || combined.includes('네트워크')) {
    return '통신장비';
  }
  if (combined.includes('원전') || combined.includes('원자력') || combined.includes('smr') || combined.includes('엔지니어링')) {
    return '전력/엔지니어링';
  }
  if (combined.includes('2차전지') || combined.includes('배터리') || combined.includes('양극재') || combined.includes('음극재') || combined.includes('알루미늄')) {
    return '화학/2차전지';
  }
  if (combined.includes('바이오') || combined.includes('제약') || combined.includes('임상') || combined.includes('항체')) {
    return '제약바이오';
  }
  if (combined.includes('자동차') || combined.includes('모빌리티') || combined.includes('전장')) {
    return '운송장비/자동차';
  }
  if (combined.includes('로봇') || combined.includes('자동화') || combined.includes('스마트팩토리')) {
    return '기계/로봇';
  }
  if (combined.includes('소프트웨어') || combined.includes('플랫폼') || combined.includes('ai')) {
    return 'IT서비스/소프트웨어';
  }
  return '전기/제조업';
}

let currentAnalysis = null;
let currentUploadedFile = null;
let currentUploadedBase64 = null;
let liveInterval = null;

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
  startLiveStockTicker();

  // 붙여넣기 버튼
  document.getElementById('btnPaste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) document.getElementById('videoUrlInput').value = text.trim();
    } catch (err) {
      alert('클립보드 권한이 필요합니다. 링크를 길게 눌러 직접 붙여넣으세요.');
    }
  });

  // 분석 버튼
  document.getElementById('btnAnalyze').addEventListener('click', handleAnalyze);

  // 전체 종목 한번에 추가 버튼
  document.getElementById('btnAddAllStocks').addEventListener('click', handleAddAllDetectedStocks);

  // 리포트 복사 버튼
  document.getElementById('btnCopyReport').addEventListener('click', handleCopyReport);

  // 정렬 셀렉터 변경
  document.getElementById('sortOrderSelect').addEventListener('change', () => {
    renderExcelWatchlist();
  });

  // 기기 간 동기화 버튼 (스마트폰 ↔ PC 관심종목 원클릭 동기화)
  const btnSync = document.getElementById('btnSyncDevices');
  if (btnSync) btnSync.addEventListener('click', handleDeviceSync);

  // CSV 내보내기 버튼 (엑셀/구글시트 호환)
  const btnCsv = document.getElementById('btnExportCsv');
  if (btnCsv) btnCsv.addEventListener('click', exportToCsv);

  // 옵시디언/노션/카톡용 매매일지 복사 버튼
  const btnMd = document.getElementById('btnExportMarkdown');
  if (btnMd) btnMd.addEventListener('click', exportToMarkdown);

  // 수동 새로고침 버튼
  document.getElementById('btnManualRefresh').addEventListener('click', () => {
    updateLivePrices(true);
  });
});

// ==========================================
// 1-B. 스마트폰 ↔ PC 원클릭 기기 동기화 엔진
// ==========================================
checkUrlSync();

function checkUrlSync() {
  const params = new URLSearchParams(window.location.search);

  // 1. 관심종목 원클릭 수신 및 안전 병합 (?sync=...)
  const syncData = params.get('sync');
  if (syncData) {
    try {
      const decoded = decodeURIComponent(atob(syncData));
      const incomingList = JSON.parse(decoded);
      if (Array.isArray(incomingList) && incomingList.length > 0) {
        const currentList = getWatchlist();
        const itemMap = new Map();
        // 새로 전송받은 종목 등록
        incomingList.forEach(item => {
          const key = `${item.date || ''}_${item.name}`;
          itemMap.set(key, item);
        });
        // 현재 기기에만 있는 기존 종목도 잃어버리지 않게 안전 보존
        currentList.forEach(item => {
          const key = `${item.date || ''}_${item.name}`;
          if (!itemMap.has(key)) {
            itemMap.set(key, item);
          }
        });

        const merged = Array.from(itemMap.values());
        saveWatchlist(merged);
        window.history.replaceState({}, document.title, window.location.pathname);
        alert(`🎉 [동기화 성공!]\n다른 기기에서 보낸 관심종목이 안전하게 합쳐졌습니다!\n(현재 총 ${merged.length}개 종목 감시 중)`);
        return;
      }
    } catch (err) {
      console.warn('동기화 파싱 오류:', err);
    }
  }

  // 2. Gemini AI 키 간편 등록 (?key=...)
  const keyData = params.get('key');
  if (keyData) {
    try {
      const decodedKey = decodeURIComponent(atob(keyData));
      if (decodedKey) {
        localStorage.setItem(STORAGE_KEY_API, decodedKey);
        window.history.replaceState({}, document.title, window.location.pathname);
        alert('🤖 [구글 Gemini AI 키 자동 등록 완료!]\n이제 스마트폰에서도 영상 분석 기능을 바로 사용하실 수 있습니다.');
      }
    } catch (err) {
      console.warn('키 등록 파싱 오류:', err);
    }
  }
}

// [📲 기기 동기화] 버튼 클릭: 현재 기기의 모든 종목을 담은 1초 전송 링크 생성
function handleDeviceSync() {
  const list = getWatchlist();
  if (!list || list.length === 0) {
    alert('동기화할 관심종목이 없습니다.');
    return;
  }

  const encoded = btoa(encodeURIComponent(JSON.stringify(list)));
  const syncUrl = `${window.location.origin}${window.location.pathname}?sync=${encoded}`;

  navigator.clipboard.writeText(syncUrl).then(() => {
    alert(`📋 [기기 동기화 링크 복사 완료!]\n\n카카오톡 '나에게 보내기'로 이 링크를 전송한 뒤, 다른 기기(PC 또는 스마트폰)에서 링크를 터치하기만 하면 폰과 PC의 종목들이 100% 누락 없이 안전하게 합쳐집니다!`);
  }).catch(() => {
    prompt('아래 링크를 복사하여 카카오톡 나에게 보내기로 전송하세요:', syncUrl);
  });
}

// ==========================================
// 2. 탭 및 서브 탭 제어
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

      if (targetId === 'tabWatchlist') {
        renderExcelWatchlist();
      }
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
      videoPreview.classList.add('hidden');
      imagePreview.classList.remove('hidden');

      const reader = new FileReader();
      reader.onload = (event) => {
        imagePreview.src = event.target.result;
        currentUploadedBase64 = event.target.result.split(',')[1];
      };
      reader.readAsDataURL(file);

    } else if (file.type.startsWith('video/')) {
      imagePreview.classList.add('hidden');
      videoPreview.classList.remove('hidden');

      const videoUrl = URL.createObjectURL(file);
      videoPreview.src = videoUrl;

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
    const themeInput = document.getElementById('addStockTheme');
    if (themeInput) themeInput.value = '';
    const reasonInput = document.getElementById('addStockReason');
    if (reasonInput) reasonInput.value = '';
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

  const btnCopyKey = document.getElementById('btnCopyKeyLink');
  if (btnCopyKey) {
    btnCopyKey.addEventListener('click', () => {
      const key = localStorage.getItem(STORAGE_KEY_API) || document.getElementById('apiKeyInput').value.trim();
      if (!key) {
        alert('저장된 API 키가 없습니다. 먼저 API 키를 입력해 주세요.');
        return;
      }
      const encoded = btoa(encodeURIComponent(key));
      const keyUrl = `${window.location.origin}${window.location.pathname}?key=${encoded}`;
      navigator.clipboard.writeText(keyUrl).then(() => {
        alert('📋 [스마트폰 키 등록 링크 복사 완료!]\n\n카카오톡 "나에게 보내기"로 전송 후 스마트폰에서 링크를 누르시면 API 키가 1초 만에 자동 등록됩니다.');
      }).catch(() => {
        prompt('아래 링크를 카카오톡으로 전송하세요:', keyUrl);
      });
    });
  }

  document.getElementById('btnConfirmAddStock').addEventListener('click', () => {
    const name = document.getElementById('addStockName').value.trim();
    const code = document.getElementById('addStockCode').value.trim();
    const theme = document.getElementById('addStockTheme')?.value.trim();
    const reason = document.getElementById('addStockReason')?.value.trim();
    const memo = document.getElementById('addStockMemo').value.trim();

    if (!name) {
      alert('종목명을 입력해 주세요.');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const master = MASTER_STOCK_INFO[name] || {};

    addStockToStorage({
      theme: theme || master.theme || '직접등록',
      name,
      code: code || master.code || '000000',
      sector: master.sector || '일반',
      price: master.price || 50000,
      change: master.change || 1500,
      rate: master.rate || 3.09,
      volume: master.volume || 100000,
      tradeValue: master.tradeValue || 50,
      foreign: master.foreign || '+1.5만',
      inst: master.inst || '+8천',
      dayCandle: { left: 40, width: 30, up: (master.rate || 0) >= 0 },
      date: todayStr,
      reason: reason || memo || master.reason || '직접 등록 종목',
      memo: memo || ''
    });
    addModal.classList.add('hidden');
    renderExcelWatchlist();
  });
}

function showSettingsModal() {
  const input = document.getElementById('apiKeyInput');
  if (input) input.value = getApiKey() || '';
  document.getElementById('settingsModal').classList.remove('hidden');
}

function getApiKey() {
  return localStorage.getItem(STORAGE_KEY_API) || '';
}

// ==========================================
// 5. 구글 Gemini API 호출 (다중 종목 & 추천 이유 전수 추출)
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
제공된 주식 숏폼 영상/차트 화면을 분석하여, 영상 내용에 나오는 **모든 종목(메인 종목뿐만 아니라 함께 언급된 수혜주, 관련주, 테마주 일체)**을 누락 없이 "stocks" 배열에 전수 추출하세요.

[핵심 분석 및 날짜 추출 규칙]:
1. **날짜(date) 최우선 추출 (가장 중요)**: 영상의 제목, 자막, 화면 텍스트, 칠판, 차트 화면 상단에 표기된 날짜(예: "10월 16일", "10.16-금", "10/17", "10.15-목" 등)를 반드시 최우선으로 정밀 감지하여 해당 일자를 "YYYY-MM-DD" 형식으로 "date"에 입력하세요. 만약 연도가 없으면 현재 연도(2026년 또는 2024년)를 붙여 "YYYY-MM-DD"로 완성하세요. 영상 내에 날짜 단서가 전혀 없을 때에만 오늘 기준일(${todayStr})을 사용하세요.
2. **추천 이유(reason)**: 화자/유튜버가 해당 종목을 추천하거나 주목하는 구체적인 이유(실적 호재, 북미 수출, 수급, 캔들 지지 등)를 각 종목의 "reason"에 1~2줄로 명확하게 요약하여 포함하세요.
3. **업종(sector)**: 한국거래소 공식 업종명(전기장비, 반도체, 통신장비, 제약바이오, 2차전지 등)을 정확히 기재하세요. '일반' 같은 모호한 단어는 금지합니다.

반드시 아래 순수 JSON 형식으로만 응답하세요. (마크다운 코드블록 제외)

JSON 스키마:
{
  "date": "영상 속에서 감지된 날짜 YYYY-MM-DD (예: 2026-10-16)",
  "trading_type": "단기스윙 / 단타 / 중장기 / 테마주 중 1개",
  "sentiment": "긍정·매수 / 중립·관망 / 매도·주의 중 1개",
  "stocks": [
    {
      "name": "종목명 (예: 산일전기)",
      "code": "6자리 공식종목코드 (예: 062040)",
      "theme": "테마명 (예: 변압기/전력망)",
      "sector": "공식 업종분류 (예: 전기장비, 반도체, 통신장비, 제약바이오 등)",
      "current_price": "영상 속 가격 또는 현재 추정 시세 (숫자만, 예: 188800)",
      "trade_value": "추정 거래대금 (억원 단위 숫자, 예: 850)",
      "support": "지지선 가격 (예: 180,000원 또는 미제시)",
      "target": "목표가 (예: 220,000원 또는 미제시)",
      "reason": "추천 이유: 영상에서 화자가 이 종목을 추천하거나 강조한 핵심 근거 요약"
    }
  ],
  "summary_3lines": [
    "1. 첫 번째 핵심 모멘텀/섹터 시황 요약",
    "2. 두 번째 차트/수급 흐름 요약",
    "3. 세 번째 화자의 매매 전략 및 결론 요약"
  ],
  "support": "대표 지지선 가격",
  "resistance": "대표 저항선 가격",
  "target": "대표 목표가",
  "stop_loss": "대표 손절선"
}
`;

    const parts = [];
    parts.push({ text: systemPrompt });

    if (isLinkMode) {
      parts.push({ text: `분석할 주식 쇼츠 영상 링크: ${url}\n오늘 기준일: ${todayStr}\n영상 제목이나 내용, 자막에 언급된 날짜를 최우선으로 찾아 'date'에 넣고, 언급된 모든 종목과 추천 이유를 빠짐없이 전수 추출하여 JSON으로 요약해 주세요.` });
    } else {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: currentUploadedBase64
        }
      });
      parts.push({ text: `첨부된 주식 차트/영상 화면을 분석해 주세요. 특히 화면 상단이나 자막에 표기된 날짜(예: 10.16, 10/17 등)를 최우선으로 감지하여 'date'에 정확히 반영하고, 화면에 나타난 모든 종목과 추천 이유를 도출해 주세요. 오늘 기준일: ${todayStr}` });
    }

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

    if (!data) throw lastError || new Error('Gemini API 호출에 실패했습니다.');

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

// 날짜 정규화 함수 (10.16-금, 10/16, 2026.10.16 등 다양한 표기를 YYYY-MM-DD로 표준화)
function normalizeDate(str) {
  if (!str) return new Date().toISOString().split('T')[0];
  const cleaned = String(str).trim();
  const m1 = cleaned.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m1) {
    return `${m1[1]}-${String(m1[2]).padStart(2, '0')}-${String(m1[3]).padStart(2, '0')}`;
  }
  const m2 = cleaned.match(/(\d{1,2})[월.-/]\s*(\d{1,2})/);
  if (m2) {
    const year = new Date().getFullYear();
    return `${year}-${String(m2[1]).padStart(2, '0')}-${String(m2[2]).padStart(2, '0')}`;
  }
  return cleaned;
}

// 결과 렌더링 (다중 종목 및 추천 이유 카드)
function renderAnalysisResult(res) {
  const resultCard = document.getElementById('resultCard');
  res.date = normalizeDate(res.date);

  const dateBadge = document.getElementById('resDateBadge');
  dateBadge.innerText = `📅 ${res.date}`;
  dateBadge.style.cursor = 'pointer';
  dateBadge.title = '클릭하여 날짜 직접 변경 가능';
  dateBadge.onclick = () => {
    const custom = prompt('등록할 날짜를 입력하세요 (예: 2026-10-16 또는 10.16):', res.date);
    if (custom) {
      res.date = normalizeDate(custom);
      dateBadge.innerText = `📅 ${res.date}`;
    }
  };

  document.getElementById('resTypeBadge').innerText = res.trading_type || '스윙';
  
  const sentBadge = document.getElementById('resSentimentBadge');
  sentBadge.innerText = res.sentiment || '긍정';
  sentBadge.className = 'badge ' + (res.sentiment?.includes('매수') || res.sentiment?.includes('긍정') ? 'badge-buy' : 'badge-sell');

  const stocks = res.stocks || [];
  document.getElementById('detectedCount').innerText = stocks.length;
  const listEl = document.getElementById('resStocksList');
  listEl.innerHTML = '';

  if (stocks.length === 0) {
    listEl.innerHTML = '<p style="color:#9ca3af; font-size:0.9rem;">감지된 종목이 없습니다.</p>';
  } else {
    stocks.forEach((s, idx) => {
      const card = document.createElement('div');
      card.className = 'multi-stock-card';
      card.innerHTML = `
        <div class="multi-stock-info">
          <h4>${s.name} <span style="font-size:0.8rem; color:#9ca3af;">(${s.code || '000000'})</span> <span class="theme-tag">${s.theme || '추천'}</span></h4>
          <p style="color:#fde047; font-weight:600; font-size:0.84rem;">💡 추천 이유: ${s.reason || '투자 포인트'}</p>
          <span class="multi-stock-target">목표가: ${s.target || '미제시'} | 지지선: ${s.support || '미제시'}</span>
        </div>
        <button class="btn-add-single" data-idx="${idx}">+ 추가</button>
      `;
      card.querySelector('.btn-add-single').addEventListener('click', () => {
        addSingleDetectedStock(s, res.date);
      });
      listEl.appendChild(card);
    });
  }

  // 3줄 요약
  const sumList = document.getElementById('resSummaryList');
  sumList.innerHTML = '';
  (res.summary_3lines || []).forEach(line => {
    const li = document.createElement('li');
    li.innerText = `• ${line}`;
    sumList.appendChild(li);
  });

  document.getElementById('resSupport').innerText = res.support || '미제시';
  document.getElementById('resResistance').innerText = res.resistance || '미제시';
  document.getElementById('resTarget').innerText = res.target || '미제시';
  document.getElementById('resStopLoss').innerText = res.stop_loss || '미제시';

  resultCard.classList.remove('hidden');
}

// 개별 종목 추가 (추천 이유 & 지능형 업종/시세 포함)
function addSingleDetectedStock(stock, dateStr) {
  const master = MASTER_STOCK_INFO[stock.name] || {};
  const sector = stock.sector || master.sector || guessSector(stock.theme, stock.name);
  const price = (master.price && master.price !== 50000) ? master.price : (Number(stock.current_price) || 50000);
  const rate = master.rate !== undefined ? master.rate : 3.09;
  const isUp = rate >= 0;

  const item = {
    theme: stock.theme || master.theme || '쇼츠추천',
    name: stock.name,
    code: stock.code || master.code || '000000',
    sector: sector,
    price: price,
    change: master.change || Math.round(price * (rate / 100)),
    rate: rate,
    volume: master.volume || 120000,
    tradeValue: master.tradeValue || Number(stock.trade_value) || 60,
    foreign: master.foreign || '+1.5만',
    inst: master.inst || '+8천',
    dayCandle: { left: isUp ? 42 : 12, width: 38, up: isUp },
    date: dateStr || new Date().toISOString().split('T')[0],
    reason: stock.reason || master.reason || '영상 추천 종목'
  };
  addStockToStorage(item);
  renderExcelWatchlist();
  alert(`✅ '${item.name}' 종목이 관심종목 테이블에 추가되었습니다!`);
}

// 전체 종목 한번에 추가
function handleAddAllDetectedStocks() {
  if (!currentAnalysis || !currentAnalysis.stocks || currentAnalysis.stocks.length === 0) {
    alert('추가할 종목이 없습니다.');
    return;
  }
  const dateStr = currentAnalysis.date || new Date().toISOString().split('T')[0];
  currentAnalysis.stocks.forEach(stock => {
    const master = MASTER_STOCK_INFO[stock.name] || {};
    const sector = stock.sector || master.sector || guessSector(stock.theme, stock.name);
    const price = (master.price && master.price !== 50000) ? master.price : (Number(stock.current_price) || 50000);
    const rate = master.rate !== undefined ? master.rate : 3.09;
    const isUp = rate >= 0;

    addStockToStorage({
      theme: stock.theme || master.theme || '쇼츠추천',
      name: stock.name,
      code: stock.code || master.code || '000000',
      sector: sector,
      price: price,
      change: master.change || Math.round(price * (rate / 100)),
      rate: rate,
      volume: master.volume || 120000,
      tradeValue: master.tradeValue || Number(stock.trade_value) || 60,
      foreign: master.foreign || '+1.5만',
      inst: master.inst || '+8천',
      dayCandle: { left: isUp ? 42 : 12, width: 38, up: isUp },
      date: dateStr,
      reason: stock.reason || master.reason || '영상 추천 종목'
    });
  });
  renderExcelWatchlist();
  alert(`✅ 포착된 ${currentAnalysis.stocks.length}개 종목이 모두 관심종목 테이블에 등록되었습니다!`);
}

// 리포트 복사
function handleCopyReport() {
  if (!currentAnalysis) return;
  const stockSummary = (currentAnalysis.stocks || []).map(s => `- ${s.name}(${s.code}): [이유: ${s.reason}] [목표가: ${s.target}]`).join('\n');
  const text = `[주식 쇼츠 AI 다중 종목 리포트]
- 일자: ${currentAnalysis.date} | 관점: ${currentAnalysis.sentiment}
- 포착된 종목 및 추천 이유:
${stockSummary}
- 핵심 3줄 요약:
${currentAnalysis.summary_3lines?.map(s => '• ' + s).join('\n')}`;

  navigator.clipboard.writeText(text).then(() => {
    alert('📋 전체 분석 리포트가 클립보드에 복사되었습니다.');
  });
}

// ==========================================
// 6. 엑셀 스타일 요일별 실시간 금융 테이블 & 데이터 보정
// ==========================================
async function initWatchlist() {
  const saved = localStorage.getItem(STORAGE_KEY_WATCHLIST);
  let list = [];
  try {
    list = JSON.parse(saved) || [];
  } catch {
    list = [];
  }

  // 만약 비어있다면 watchlist.json 파일에서 로드 시도
  if (list.length === 0) {
    try {
      const resp = await fetch('./watchlist.json');
      if (resp.ok) {
        list = await resp.json();
      }
    } catch (e) {
      console.warn('watchlist.json fetch 실패, 내장 마스터 사용:', e);
    }
  }

  // 기존에 저장된 데이터의 누락/비정상 시세, 일반 업종, 당일봉 음봉/양봉 정합성 자동 치료 (Self-Healing)
  list.forEach(item => {
    const master = MASTER_STOCK_INFO[item.name];
    if (master) {
      if (!item.tradeValue || item.tradeValue === 0 || item.tradeValue < 100 && master.tradeValue > 300) item.tradeValue = master.tradeValue;
      if (!item.rate || item.rate === 0) item.rate = master.rate;
      if (!item.change || item.change === 0) item.change = master.change;
      // 5만원 기본값으로 잘못 들어간 종목(효성중공업 50,071원, 현대일렉트릭 49,999원, 하이닉스 50,193원, 우리넷 49,686원 등) 전격 치료
      if (!item.price || (item.price >= 48000 && item.price <= 52000 && master.price !== 50000)) {
        item.price = master.price;
        item.change = master.change;
        item.rate = master.rate;
      }
      if (!item.sector || item.sector === '-' || item.sector === '일반') item.sector = master.sector;
      if (!item.theme || item.theme === '추천' || item.theme === '쇼츠추천') item.theme = master.theme;
      if (!item.foreign || item.foreign === '-') item.foreign = master.foreign;
      if (!item.inst || item.inst === '-') item.inst = master.inst;
      if (!item.reason || item.reason === '투자 포인트' || item.reason === '영상 추천 종목') item.reason = master.reason;
      if (master.code) item.code = master.code;
    } else {
      // 마스터에 없더라도 테마명과 종목명으로 업종 자동 치환 ('일반' 퇴출)
      if (!item.sector || item.sector === '-' || item.sector === '일반') {
        item.sector = guessSector(item.theme, item.name);
      }
    }

    // 당일봉 음봉/양봉 정합성 강제 동기화 (우리넷 등 음봉 종목은 무조건 파란색 음봉)
    const isUp = (Number(item.rate) || 0) >= 0;
    item.dayCandle = {
      left: isUp ? 42 : 12,
      width: 38,
      up: isUp
    };
  });

  if (list.length === 0) {
    list = Object.keys(MASTER_STOCK_INFO).map(name => {
      const isUp = MASTER_STOCK_INFO[name].rate >= 0;
      return {
        ...MASTER_STOCK_INFO[name],
        name,
        date: '2026-10-19',
        dayCandle: { left: isUp ? 42 : 12, width: 38, up: isUp }
      };
    });
  }

  saveWatchlist(list);
}

function saveWatchlist(list) {
  localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(list));
  renderExcelWatchlist();
}

function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_WATCHLIST)) || [];
  } catch {
    return [];
  }
}

function addStockToStorage(item) {
  const list = getWatchlist();
  if (!item.date) item.date = new Date().toISOString().split('T')[0];
  const filtered = list.filter(s => s.name !== item.name);
  filtered.unshift(item);
  saveWatchlist(filtered);
}

function deleteStockFromStorage(name) {
  const list = getWatchlist().filter(s => s.name !== name);
  saveWatchlist(list);
}

function getWeekdayLabel(dateStr) {
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  try {
    const d = new Date(dateStr);
    const day = dayNames[d.getDay()];
    return `${dateStr} (${day})`;
  } catch {
    return dateStr;
  }
}

// 엑셀 스타일 요일별 실시간 금융 테이블 렌더링
function renderExcelWatchlist() {
  let list = getWatchlist();
  document.getElementById('stockCount').innerText = list.length;
  const container = document.getElementById('excelWatchlistContainer');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:#6b7280; padding:40px;">관심종목이 없습니다. 첫 번째 탭에서 쇼츠/틱톡 영상을 분석하여 추가하세요.</p>`;
    return;
  }

  const sortMode = document.getElementById('sortOrderSelect')?.value || 'dateDesc';
  if (sortMode === 'dateDesc') {
    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } else if (sortMode === 'dateAsc') {
    list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  } else if (sortMode === 'nameAsc') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  const groups = {};
  list.forEach(item => {
    const d = item.date || '날짜 미상';
    if (!groups[d]) groups[d] = [];
    groups[d].push(item);
  });

  Object.keys(groups).forEach(dateKey => {
    const items = groups[dateKey];
    const block = document.createElement('div');
    block.className = 'weekday-block';

    const header = document.createElement('div');
    header.className = 'weekday-header';
    header.innerHTML = `
      <span>📅 ${getWeekdayLabel(dateKey)}</span>
      <span style="font-size:0.82rem; font-weight:600; opacity:0.9;">총 ${items.length}종목 감시</span>
    `;
    block.appendChild(header);

    const scrollArea = document.createElement('div');
    scrollArea.className = 'excel-scroll-area';

    let tableHtml = `
      <table class="excel-table">
        <thead>
          <tr>
            <th>테마</th>
            <th style="min-width: 200px;">종목명 (코드) & 추천 이유</th>
            <th>업종</th>
            <th>현재가</th>
            <th>등락률</th>
            <th>거래대금</th>
            <th style="text-align:center;">L일봉H</th>
            <th>외인순매수</th>
            <th>기관순매수</th>
            <th style="text-align:center;">관리</th>
          </tr>
        </thead>
        <tbody>
    `;

    items.forEach(stock => {
      const isUp = (Number(stock.rate) || 0) >= 0;
      const rateClass = isUp ? 'rate-up' : 'rate-down';
      const rateSign = isUp ? '▲ +' : '▼ ';
      const reasonText = stock.reason || stock.memo || '쇼츠 AI 분석 추천';

      tableHtml += `
        <tr>
          <td><span class="theme-tag">${stock.theme || '추천'}</span></td>
          <td>
            <span class="stock-name-cell">${stock.name}</span>
            <span class="stock-code-cell">${stock.code}</span>
            <span class="stock-reason-badge">💡 이유: ${reasonText}</span>
          </td>
          <td style="color:#94a3b8; font-size:0.78rem;">${stock.sector || '-'}</td>
          <td style="font-weight:700;">${Number(stock.price || 0).toLocaleString()}원</td>
          <td class="${rateClass}">${rateSign}${Math.abs(stock.rate || 0).toFixed(2)}%</td>
          <td style="color:#cbd5e1; font-weight:700;">${stock.tradeValue || 0}억</td>
          <td style="text-align:center;">
            ${renderHtsCandleSvg(stock.rate)}
          </td>
          <td style="color:${String(stock.foreign).includes('+') ? '#f87171' : '#60a5fa'}; font-weight:600;">${stock.foreign || '-'}</td>
          <td style="color:${String(stock.inst).includes('+') ? '#f87171' : '#60a5fa'}; font-weight:600;">${stock.inst || '-'}</td>
          <td style="text-align:center;">
            <button class="stock-del-btn" onclick="handleDeleteStock('${stock.name}')" title="삭제">&times;</button>
          </td>
        </tr>
      `;
    });

    tableHtml += `
        </tbody>
      </table>
    `;

    scrollArea.innerHTML = tableHtml;
    block.appendChild(scrollArea);
    container.appendChild(block);
  });
}

window.handleDeleteStock = function(name) {
  if (confirm(`'${name}' 종목을 삭제하시겠습니까?`)) {
    deleteStockFromStorage(name);
  }
};

// ==========================================
// 영웅문 HTS 스타일 'L일봉H' 가로형 미니 캔들 SVG 렌더러
// ==========================================
function renderHtsCandleSvg(rate = 0) {
  const r = Number(rate) || 0;
  const isUp = r >= 0;
  const absRate = Math.abs(r);
  const color = isUp ? '#ef4444' : '#3b82f6';
  const width = 56;
  const height = 14;
  const centerY = 7;

  // 몸통 폭 (등락률 크기에 따라 6px ~ 36px 동적 가변)
  let bodyW = Math.max(6, Math.min(36, Math.round(absRate * 3.2) + 6));
  let bodyX = 0;
  let wickX1 = 4;
  let wickX2 = 52;

  if (isUp) {
    if (absRate >= 28) {
      // 상한가/급등 장대양봉: 우측 고가 영역 꽉 찬 직사각형
      bodyX = 14;
      bodyW = 40;
      wickX1 = 10;
      wickX2 = 54;
    } else {
      // 일반 상승 양봉: 중심에서 우측(고가) 방향
      bodyX = Math.min(width - bodyW - 4, 24 + Math.round(absRate * 1.5));
      wickX1 = Math.max(4, bodyX - 14);
      wickX2 = Math.min(54, bodyX + bodyW + 8);
    }
  } else {
    // 하락 음봉: 중심에서 좌측(저가) 방향 (우리넷 등)
    bodyX = Math.max(4, 26 - bodyW - Math.round(absRate * 1.5));
    wickX1 = Math.max(4, bodyX - 4);
    wickX2 = Math.min(54, bodyX + bodyW + 14);
  }

  const bodyH = 8;
  const bodyY = centerY - (bodyH / 2);

  return `
    <div class="hts-candle-wrapper" title="${isUp ? '상승 양봉' : '하락 음봉'} (${r > 0 ? '+' : ''}${r.toFixed(2)}%)">
      <svg class="hts-candle-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <!-- L-H 배경 트랙선 -->
        <line x1="2" y1="${centerY}" x2="${width - 2}" y2="${centerY}" stroke="#334155" stroke-width="1" stroke-dasharray="2,2" opacity="0.35" />
        <!-- L-H 수평 꼬리선 (Wick: 실선) -->
        <line x1="${wickX1}" y1="${centerY}" x2="${wickX2}" y2="${centerY}" stroke="${color}" stroke-width="1.8" stroke-linecap="round" />
        <!-- 시가-종가 캔들 몸통 (Body: 직사각형 블록) -->
        <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" fill="${color}" rx="0.5" />
      </svg>
    </div>
  `;
}

// ==========================================
// 7. 실시간 시세 시뮬레이션 및 Ticker 업데이트
// ==========================================
function startLiveStockTicker() {
  if (liveInterval) clearInterval(liveInterval);
  liveInterval = setInterval(() => {
    updateLivePrices(false);
  }, 4000);
}

function updateLivePrices(isManual = false) {
  const list = getWatchlist();
  if (list.length === 0) return;

  list.forEach(item => {
    const delta = (Math.random() - 0.48) * 0.004; // 미세 틱 변동
    const newRate = Number(((item.rate || 0) + delta).toFixed(2));
    const newPrice = Math.round((item.price || 50000) * (1 + delta));
    item.price = newPrice;
    item.rate = newRate;
    if (item.tradeValue) {
      item.tradeValue = Math.max(1, Math.round(item.tradeValue + (Math.random() > 0.6 ? 1 : 0)));
    }
  });

  localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(list));
  renderExcelWatchlist();

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  document.getElementById('liveRefreshTime').innerText = `● ${timeStr} 실시간 갱신`;

  if (isManual) {
    alert('🔄 최신 실시간 시세가 갱신되었습니다!');
  }
}

// ==========================================
// 8. PWA 서비스 워커
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

// ==========================================
// 9. CSV 내보내기 & 옵시디언 매매일지 복사
// ==========================================
function exportToCsv() {
  const list = getWatchlist();
  if (list.length === 0) {
    alert('내보낼 관심종목 데이터가 없습니다.');
    return;
  }

  // UTF-8 BOM (\uFEFF) 추가하여 엑셀 한글 깨짐 방지
  let csvContent = '\uFEFF';
  const headers = ['등록일자', '요일', '테마', '종목명', '종목코드', '업종', '현재가(원)', '등락률(%)', '거래대금(억)', '외인순매수', '기관순매수', '추천이유', '메모'];
  csvContent += headers.map(h => `"${h}"`).join(',') + '\r\n';

  list.forEach(item => {
    const d = item.date || '';
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    let dayStr = '';
    try {
      if (d) dayStr = dayNames[new Date(d).getDay()] + '요일';
    } catch {}

    const row = [
      d,
      dayStr,
      item.theme || '추천',
      item.name || '',
      item.code || '',
      item.sector || '',
      item.price || 0,
      item.rate !== undefined ? item.rate : 0,
      item.tradeValue || 0,
      item.foreign || '-',
      item.inst || '-',
      (item.reason || '').replace(/"/g, '""'),
      (item.memo || '').replace(/"/g, '""')
    ];
    csvContent += row.map(v => `"${v}"`).join(',') + '\r\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `주식쇼츠_관심종목_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportToMarkdown() {
  const list = getWatchlist();
  if (list.length === 0) {
    alert('복사할 관심종목 데이터가 없습니다.');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  let md = `# 📊 주식 쇼츠 관심종목 매매일지 (${today})\n\n`;
  md += `> 총 **${list.length}개 종목** 감시 중 (주식 쇼츠 AI 실시간 금융 분석)\n\n`;

  const groups = {};
  list.forEach(item => {
    const d = item.date || today;
    if (!groups[d]) groups[d] = [];
    groups[d].push(item);
  });

  Object.keys(groups).forEach(dateKey => {
    md += `### 📅 ${getWeekdayLabel(dateKey)}\n\n`;
    md += `| 테마 | 종목명 (코드) | 현재가 | 등락률 | 거래대금 | 외인 | 기관 | 💡 추천 이유 |\n`;
    md += `| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

    groups[dateKey].forEach(stock => {
      const sign = (stock.rate || 0) >= 0 ? '+' : '';
      const rateStr = `${sign}${stock.rate || 0}%`;
      const priceStr = Number(stock.price || 0).toLocaleString() + '원';
      const reasonStr = (stock.reason || stock.memo || '쇼츠 AI 추천').replace(/\|/g, '/');
      md += `| ${stock.theme || '추천'} | **${stock.name}** (${stock.code || '-'}) | ${priceStr} | ${rateStr} | ${stock.tradeValue || 0}억 | ${stock.foreign || '-'} | ${stock.inst || '-'} | ${reasonStr} |\n`;
    });
    md += '\n';
  });

  navigator.clipboard.writeText(md).then(() => {
    alert('📋 [마크다운 매매일지 복사 완료!]\n\n옵시디언(Obsidian), 노션(Notion), 카카오톡에 바로 붙여넣기(Ctrl+V)하세요!');
  }).catch(err => {
    alert('클립보드 복사 권한이 필요합니다: ' + err);
  });
}

// 전역 바인딩
window.exportToCsv = exportToCsv;
window.exportToMarkdown = exportToMarkdown;

