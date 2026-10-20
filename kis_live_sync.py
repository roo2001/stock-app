#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kis_live_sync.py - 한국투자증권(KIS) OpenAPI ➔ 웹앱 실시간 시세 및 외인/기관 수급 동기화 브릿지
- D:\[R]\[00.공부_하자]\[00.관심종목 실시간]\env.txt 설정 로드
- watchlist.json 관심종목의 실제 현재가, 등락률, 거래량, 거래대금, 외인가집계, 기관수급 자동 갱신
- 로컬 경량 HTTP API 서버(포트 8099)를 가동하여 웹앱 브라우저와 100% 실시간 동기화
"""

import sys
import os
import json
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import requests

# UTF-8 출력 설정
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WATCHLIST_PATH = os.path.join(BASE_DIR, 'web_app', 'watchlist.json')
ENV_PATH = r'D:\[R]\[00.공부_하자]\[00.관심종목 실시간]\env.txt'
TOKEN_PATH = r'D:\[R]\[00.공부_하자]\[00.관심종목 실시간]\.kis_token.json'

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
    # 기존 토큰 캐시 시도
    if os.path.exists(TOKEN_PATH):
        try:
            with open(TOKEN_PATH, 'r', encoding='utf-8') as f:
                d = json.load(f)
                token = d.get('token')
                if token:
                    return token
        except Exception:
            pass

    # 신규 토큰 발급
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

def sync_kis_market_data():
    global cached_stocks
    env = load_kis_env()
    if not env.get('KIS_APP_KEY'):
        print("[오류] KIS API 키가 없습니다.")
        return

    try:
        token = get_kis_token(env)
    except Exception as e:
        print(f"[토큰 오류] {e}")
        return

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

    if not os.path.exists(WATCHLIST_PATH):
        print(f"[오류] watchlist.json이 없습니다: {WATCHLIST_PATH}")
        return

    with open(WATCHLIST_PATH, 'r', encoding='utf-8') as f:
        watchlist = json.load(f)

    updated = []
    now_str = time.strftime('%H:%M:%S')
    print(f"\n[{now_str}] 🚀 KIS 실전 시세 및 수급 갱신 시작 (총 {len(watchlist)}개 종목)...")

    for item in watchlist:
        name = item.get('name')
        code = item.get('code')
        if not code or code == '000000':
            continue

        try:
            # 1. 현재가 및 장중 가집계
            params = {'FID_COND_MRKT_DIV_CODE': 'J', 'FID_INPUT_ISCD': code}
            r = requests.get(f'{base_url}/uapi/domestic-stock/v1/quotations/inquire-price', headers=headers, params=params, timeout=5)
            if r.status_code == 200:
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
                day_candle = {'left': 40, 'width': 35, 'up': rate >= 0}
                if hgpr > lwpr and hgpr > 0:
                    rng = hgpr - lwpr
                    c_min = min(oprc, price)
                    c_max = max(oprc, price)
                    c_left = max(0, min(100, round(((c_min - lwpr) / rng) * 100)))
                    c_width = max(4, min(100 - c_left, round(((c_max - c_min) / rng) * 100)))
                    day_candle = {'left': c_left, 'width': c_width, 'up': price >= oprc}

                item['price'] = price
                item['change'] = chg
                item['rate'] = round(rate, 2)
                item['volume'] = vol
                item['tradeValue'] = amt
                item['dayCandle'] = day_candle
                if frgn_live != 0:
                    item['foreignLive'] = fmt_qty(frgn_live)

            # 2. 투자자별 확정 수급
            inv_headers = dict(headers, tr_id='FHKST01010900')
            r_inv = requests.get(f'{base_url}/uapi/domestic-stock/v1/quotations/inquire-investor', headers=inv_headers, params=params, timeout=5)
            if r_inv.status_code == 200:
                inv_out = r_inv.json().get('output', [])
                for row in inv_out:
                    f_qty = row.get('frgn_ntby_qty')
                    o_qty = row.get('orgn_ntby_qty')
                    if f_qty and str(f_qty).strip() and o_qty and str(o_qty).strip():
                        item['foreign'] = fmt_qty(f_qty)
                        item['inst'] = fmt_qty(o_qty)
                        item['investorDate'] = row.get('stck_bsop_date')
                        break

            print(f"  ✓ {name}({code}): {item.get('price'):,}원 ({item.get('rate')}%) | 외인:{item.get('foreign')} | 외인가집계:{item.get('foreignLive', '-')} | 기관:{item.get('inst')}")
            time.sleep(0.08)  # API 호출 제한 방지
        except Exception as e:
            print(f"  ✗ {name}({code}) 조회 실패: {e}")

        updated.append(item)

    cached_stocks = updated

    # 파일에 영구 보존
    with open(WATCHLIST_PATH, 'w', encoding='utf-8') as f:
        json.dump(updated, f, ensure_ascii=False, indent=2)
    print(f"[{time.strftime('%H:%M:%S')}] ✅ watchlist.json 갱신 완료! 웹앱에 실시간 데이터 반영됨.")

class ApiHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/stocks'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
            self.end_headers()
            self.wfile.write(json.dumps(cached_stocks, ensure_ascii=False).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def log_message(self, format, *args):
        pass  # 콘솔 로그 간소화

def start_server():
    server = HTTPServer(('127.0.0.1', PORT), ApiHandler)
    print(f"🟢 [로컬 KIS 브릿지 서버 가동] http://127.0.0.1:{PORT}/api/stocks")
    server.serve_forever()

def main():
    print("=" * 60)
    print("  📈 한국투자증권(KIS) 실전 OpenAPI ➔ 관심종목 실시간 브릿지  ")
    print("=" * 60)
    
    # 1회 즉시 갱신
    sync_kis_market_data()

    # 백그라운드 HTTP 서버 시작
    t = threading.Thread(target=start_server, daemon=True)
    t.start()

    print("\n💡 알림: 이 창을 띄워두시면 브라우저 웹앱에서 100% 무지연 실시간 시세가 자동 동기화됩니다.")
    print("💡 30초마다 자동으로 KIS 실전 시세를 최신화합니다. (종료: Ctrl+C)\n")

    # 주기적 갱신 루프 (30초)
    try:
        while True:
            time.sleep(30)
            sync_kis_market_data()
    except KeyboardInterrupt:
        print("\n브릿지 서버를 종료합니다.")

if __name__ == '__main__':
    main()
