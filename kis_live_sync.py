#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kis_live_sync.py - 한국투자증권(KIS) OpenAPI ➔ 웹앱 실시간 시세 및 외인/기관 수급 통합 서버
1. 005.관심종목/config/env.txt 설정 로드 (git 저장소 밖, 키 보호)
2. watchlist.json 등록 종목의 KIS 실전 시세 자동 갱신
3. 신규 종목 추가 시 KIS API 즉시 실측 조회 및 실시간 응답 (POST /api/stocks/fetch)
4. 로컬 웹 서버(포트 8099) 내장: 브라우저에서 http://localhost:8099 로 접속 시 Mixed Content 보안 차단 없이 100% 무지연 실시간 시세 연동
"""

import sys
import os
import json
import time
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
import requests

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_APP_DIR = os.path.join(BASE_DIR, 'web_app') if os.path.exists(os.path.join(BASE_DIR, 'web_app')) else BASE_DIR
WATCHLIST_PATH = os.path.join(WEB_APP_DIR, 'watchlist.json')
# KIS 키/토큰은 git 저장소(web_app) 밖인 상위 폴더 config 에 보관 (GitHub 업로드 방지)
CONFIG_DIR = os.path.join(os.path.dirname(BASE_DIR), 'config')
ENV_PATH = os.path.join(CONFIG_DIR, 'env.txt')
TOKEN_PATH = os.path.join(CONFIG_DIR, '.kis_token.json')

PORT = 8099
cached_stocks = []

def load_kis_env():
    env = {}
    if not os.path.exists(ENV_PATH):
        print(f"[경고] env.txt 파일을 찾을 수 없습니다: {ENV_PATH}")
        return env
    with open(ENV_PATH, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    return env

def get_kis_token(env):
    if os.path.exists(TOKEN_PATH):
        try:
            with open(TOKEN_PATH, 'r', encoding='utf-8') as f:
                d = json.load(f)
                token = d.get('token')
                if token:
                    return token
        except Exception:
            pass

    app_key = env.get('KIS_APP_KEY')
    app_secret = env.get('KIS_APP_SECRET')
    mode = env.get('KIS_MODE', 'real')
    base_url = 'https://openapi.koreainvestment.com:9443' if mode == 'real' else 'https://openapivts.koreainvestment.com:29443'

    url = f"{base_url}/oauth2/tokenP"
    body = {
        "grant_type": "client_credentials",
        "appkey": app_key,
        "appsecret": app_secret
    }
    r = requests.post(url, json=body, timeout=10)
    if r.status_code == 200:
        token = r.json().get('access_token')
        with open(TOKEN_PATH, 'w', encoding='utf-8') as f:
            json.dump({'token': token, 'ts': time.time()}, f)
        return token
    else:
        raise RuntimeError(f"KIS 토큰 발급 실패: {r.text}")

def fmt_qty(v):
    if v is None or v == '':
        return '-'
    try:
        v = int(v)
    except:
        return str(v)
    sign = '+' if v > 0 else ''
    abs_v = abs(v)
    if abs_v >= 10000:
        return f"{sign}{v/10000:.1f}만"
    elif abs_v >= 1000:
        return f"{sign}{v/1000:.1f}천"
    else:
        return f"{sign}{v}"

def fetch_single_stock_kis(code, env=None, token=None):
    """단일 종목의 KIS 실전 시세 및 수급 실측 조회"""
    env = env or load_kis_env()
    token = token or get_kis_token(env)
    app_key = env.get('KIS_APP_KEY')
    app_secret = env.get('KIS_APP_SECRET')
    mode = env.get('KIS_MODE', 'real')
    base_url = 'https://openapi.koreainvestment.com:9443' if mode == 'real' else 'https://openapivts.koreainvestment.com:29443'

    headers = {
        'content-type': 'application/json',
        'authorization': f'Bearer {token}',
        'appkey': app_key,
        'appsecret': app_secret,
        'tr_id': 'FHKST01010100'
    }

    params = {'FID_COND_MRKT_DIV_CODE': 'J', 'FID_INPUT_ISCD': str(code).strip().zfill(6)}
    r = requests.get(f'{base_url}/uapi/domestic-stock/v1/quotations/inquire-price', headers=headers, params=params, timeout=5)
    if r.status_code != 200:
        return None

    o = r.json().get('output', {})
    price = int(o.get('stck_prpr', 0) or 0)
    chg = int(o.get('prdy_vrss', 0) or 0)
    rate = float(o.get('prdy_ctrt', 0.0) or 0.0)
    if str(o.get('prdy_vrss_sign', '3')) in ('4', '5'):
        chg, rate = -abs(chg), -abs(rate)
    vol = int(o.get('acml_vol', 0) or 0)
    amt = round(int(o.get('acml_tr_pbmn', 0) or 0) / 100000000)
    oprc = int(o.get('stck_oprc', 0) or 0)
    hgpr = int(o.get('stck_hgpr', 0) or 0)
    lwpr = int(o.get('stck_lwpr', 0) or 0)
    frgn_live = int(o.get('frgn_ntby_qty', 0) or 0)

    # 당일봉
    is_up = price >= oprc if oprc > 0 else (rate >= 0)
    day_candle = {'left': 42 if is_up else 12, 'width': 38, 'up': is_up}
    if hgpr > lwpr and hgpr > 0 and oprc > 0:
        rng = hgpr - lwpr
        c_min = min(oprc, price)
        c_max = max(oprc, price)
        c_left = max(0, min(100, round(((c_min - lwpr) / rng) * 100)))
        c_width = max(4, min(100 - c_left, round(((c_max - c_min) / rng) * 100)))
        day_candle = {'left': c_left, 'width': c_width, 'up': is_up}

    # 수급
    inv_h = dict(headers, tr_id='FHKST01010900')
    r_inv = requests.get(f'{base_url}/uapi/domestic-stock/v1/quotations/inquire-investor', headers=inv_h, params=params, timeout=5)
    f_qty = '-'
    o_qty = '-'
    inv_date = ''
    if r_inv.status_code == 200:
        inv_rows = r_inv.json().get('output', [])
        for row in inv_rows:
            if row.get('frgn_ntby_qty') and row.get('orgn_ntby_qty'):
                f_qty = fmt_qty(row.get('frgn_ntby_qty'))
                o_qty = fmt_qty(row.get('orgn_ntby_qty'))
                inv_date = row.get('stck_bsop_date')
                break

    return {
        'code': code,
        'price': price,
        'change': chg,
        'rate': round(rate, 2),
        'volume': vol,
        'tradeValue': amt,
        'open': oprc,
        'high': hgpr,
        'low': lwpr,
        'dayCandle': day_candle,
        'foreign': f_qty,
        'foreignLive': fmt_qty(frgn_live) if frgn_live else None,
        'inst': o_qty,
        'investorDate': inv_date
    }

def sync_all_stocks():
    global cached_stocks
    env = load_kis_env()
    if not env.get('KIS_APP_KEY'):
        return

    try:
        token = get_kis_token(env)
    except Exception as e:
        print(f"[토큰 오류] {e}")
        return

    if not os.path.exists(WATCHLIST_PATH):
        return

    with open(WATCHLIST_PATH, 'r', encoding='utf-8') as f:
        watchlist = json.load(f)

    updated = []
    now_str = time.strftime('%H:%M:%S')
    print(f"\n[{now_str}] 🚀 KIS 실전 시세 자동 갱신 (총 {len(watchlist)}개 종목)...")

    for item in watchlist:
        code = item.get('code')
        name = item.get('name')
        if not code or code == '000000':
            continue

        try:
            live = fetch_single_stock_kis(code, env, token)
            if live:
                item['price'] = live['price']
                item['change'] = live['change']
                item['rate'] = live['rate']
                item['volume'] = live['volume']
                item['tradeValue'] = live['tradeValue']
                item['open'] = live['open']
                item['high'] = live['high']
                item['low'] = live['low']
                item['dayCandle'] = live['dayCandle']
                if live['foreign'] != '-': item['foreign'] = live['foreign']
                if live['foreignLive']: item['foreignLive'] = live['foreignLive']
                if live['inst'] != '-': item['inst'] = live['inst']
                if live['investorDate']: item['investorDate'] = live['investorDate']
                print(f"  ✓ {name}({code}): {item['price']:,}원 ({item['rate']}%) | 시가:{item.get('open')} | 일봉:{'양봉' if item['dayCandle']['up'] else '음봉'}")
            time.sleep(0.08)
        except Exception as e:
            print(f"  ✗ {name}({code}) 조회 실패: {e}")

        updated.append(item)

    cached_stocks = updated
    with open(WATCHLIST_PATH, 'w', encoding='utf-8') as f:
        json.dump(updated, f, ensure_ascii=False, indent=2)

class CustomAppServer(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_APP_DIR, **kwargs)

    def do_GET(self):
        if self.path.startswith('/api/stocks'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.end_headers()
            self.wfile.write(json.dumps(cached_stocks, ensure_ascii=False).encode('utf-8'))
        else:
            super().do_GET()

    def do_POST(self):
        # 신규 종목 실시간 시세 단일 조회 (POST /api/stocks/fetch)
        if self.path.startswith('/api/stocks/fetch'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                code = data.get('code')
                live = fetch_single_stock_kis(code)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(live or {}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def log_message(self, format, *args):
        pass

def start_server():
    server = HTTPServer(('0.0.0.0', PORT), CustomAppServer)
    print(f"\n=======================================================")
    print(f"  🟢 [주식 쇼츠 AI 실시간 웹 HTS 서버 가동]")
    print(f"  👉 브라우저 접속 주소: http://localhost:{PORT}")
    print(f"=======================================================\n")
    server.serve_forever()

def main():
    sync_all_stocks()

    t = threading.Thread(target=start_server, daemon=True)
    t.start()

    try:
        while True:
            time.sleep(30)
            sync_all_stocks()
    except KeyboardInterrupt:
        print("\n브릿지 서버를 종료합니다.")

if __name__ == '__main__':
    main()
