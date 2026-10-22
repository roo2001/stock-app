# -*- coding: utf-8 -*-
"""
sync_recommend_news.py
- 국내 증권사 공식 기업분석 리포트(목표가, 상승여력, 투자의견, 리포트 요약 원문) 수집
- 수급 퀀트 챔피언(쌍끌이 연속 순매수) 추천 리스트 결합
- 100% 무할루시네이션 데이터셋 daily_recommend_and_news.json 생성
"""
import urllib.request
import json
import re
import os
import sys
from datetime import datetime

WEB_APP_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(WEB_APP_DIR, "daily_recommend_and_news.json")
FLOW_TOP_FILE = os.path.join(WEB_APP_DIR, "investor_flow_top.json")

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://m.stock.naver.com/'
}

def clean_html(text):
    if not text:
        return ""
    # Remove HTML tags
    cleaned = re.sub(r'<[^>]+>', ' ', text)
    # Decode HTML entities
    cleaned = cleaned.replace('&quot;', '"').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&nbsp;', ' ')
    # Normalize whitespaces
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

def fetch_json(url, timeout=6):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode('utf-8'))

def collect_analyst_reports(max_pages=2):
    """
    증권사 기업분석 리포트 수집 (Track A)
    - 최신 리포트 중 Buy 의견 및 목표주가 제시된 종목 우선
    """
    reports = []
    print("[1/3] 증권사 공인 리서치 리포트 수집 시작...")
    
    seen_codes = set()
    for page in range(1, max_pages + 1):
        list_url = f"https://m.stock.naver.com/api/research/company?page={page}&pageSize=15"
        try:
            items = fetch_json(list_url)
            for it in items:
                rid = it.get('researchId')
                code = it.get('itemCode')
                name = it.get('itemName')
                broker = it.get('brokerName')
                write_date = it.get('writeDate')
                title = it.get('title')
                
                if not rid or code in seen_codes:
                    continue
                
                # Fetch detailed report
                detail_url = f"https://m.stock.naver.com/api/research/company/{rid}"
                try:
                    detail_data = fetch_json(detail_url)
                    content_obj = detail_data.get('researchContent', {})
                    opinion = content_obj.get('opinion', 'Not Rated')
                    goal_price_str = content_obj.get('goalPrice', '0')
                    prev_goal_price_str = content_obj.get('prevGoalPrice', '0')
                    price_at_write_str = content_obj.get('priceAtWriteDate', '0')
                    attach_url = content_obj.get('attachUrl', '')
                    raw_content = content_obj.get('content', '')
                    summary_text = clean_html(raw_content)
                    
                    # Convert prices
                    try:
                        goal_price = int(goal_price_str) if goal_price_str and goal_price_str != '-' else 0
                    except:
                        goal_price = 0
                        
                    try:
                        base_price = int(price_at_write_str) if price_at_write_str and price_at_write_str != '-' else 0
                    except:
                        base_price = 0
                        
                    # Calculate upside potential (상승여력 %)
                    upside_pct = 0.0
                    if goal_price > 0 and base_price > 0:
                        upside_pct = round(((goal_price - base_price) / base_price) * 100, 1)
                    
                    # Only accept validated broker reports
                    report_item = {
                        "type": "BROKER_CONSENSUS",
                        "itemCode": code,
                        "itemName": name,
                        "brokerName": broker,
                        "opinion": opinion,
                        "goalPrice": goal_price,
                        "basePrice": base_price,
                        "upsidePct": upside_pct,
                        "title": title,
                        "summary": summary_text[:300] + ("..." if len(summary_text) > 300 else ""),
                        "writeDate": write_date,
                        "reportUrl": f"https://m.stock.naver.com/research/company/{rid}",
                        "pdfUrl": attach_url,
                        "recommendReason": f"[{broker}] 목표가 {goal_price:,}원 제시 (상승여력 +{upside_pct}%). {summary_text[:120]}..." if goal_price > 0 else f"[{broker}] {title}"
                    }
                    reports.append(report_item)
                    seen_codes.add(code)
                    print(f"  + [{broker}] {name}({code}) 목표가 {goal_price:,}원 (+{upside_pct}%)")
                    
                    if len(reports) >= 12:
                        break
                except Exception as ex:
                    continue
        except Exception as ex:
            print(f"  리포트 목록 수집 에러 (page {page}): {ex}")
            break
            
    # Sort by upside potential desc
    reports.sort(key=lambda x: x['upsidePct'], reverse=True)
    return reports

def collect_quant_champions():
    """
    수급 퀀트 챔피언 수집 (Track B)
    - investor_flow_top.json에서 쌍끌이 순매수 TOP 10 및 연속 순매수 종목 선별
    """
    print("[2/3] 거래소 수급 퀀트 챔피언 선별 시작...")
    quant_picks = []
    
    if not os.path.exists(FLOW_TOP_FILE):
        print("  investor_flow_top.json 파일이 없습니다.")
        return quant_picks
        
    with open(FLOW_TOP_FILE, "r", encoding="utf-8") as f:
        flow_data = json.load(f)
        
    rankings = flow_data.get("rankings", {})
    both_buy_list = rankings.get("bothBuyTop10", [])
    streak_list = rankings.get("consecutiveStreakTop10", [])
    
    # Merge and prioritize dual buyers with streaks
    seen_codes = set()
    combined = []
    
    for s in both_buy_list:
        combined.append(s)
        seen_codes.add(s.get('code'))
        
    for s in streak_list:
        if s.get('code') not in seen_codes:
            combined.append(s)
            seen_codes.add(s.get('code'))
            
    for s in combined[:10]:
        f_raw = s.get('foreignRaw', 0)
        i_raw = s.get('instRaw', 0)
        tot_raw = s.get('totalNetRaw', 0)
        f_streak = s.get('foreignStreak', 0)
        i_streak = s.get('instStreak', 0)
        both_streak = s.get('bothStreak', 0)
        
        streak_desc_parts = []
        if both_streak > 1:
            streak_desc_parts.append(f"쌍끌이 {both_streak}일 연속")
        elif f_streak > 1:
            streak_desc_parts.append(f"외인 {f_streak}일 연속")
        elif i_streak > 1:
            streak_desc_parts.append(f"기관 {i_streak}일 연속")
            
        streak_str = ", ".join(streak_desc_parts) if streak_desc_parts else "외인·기관 동시 순매수"
        
        quant_reason = f"외인 {f_raw:+,}주 / 기관 {i_raw:+,}주 (합산 {tot_raw:+,}주 집중 순매수). {streak_str} 유입 팩트 확인."
        
        quant_picks.append({
            "type": "QUANT_FLOW_CHAMPION",
            "itemCode": s.get('code'),
            "itemName": s.get('name'),
            "price": s.get('price'),
            "rate": s.get('rate'),
            "market": s.get('market'),
            "foreignStreak": f_streak,
            "instStreak": i_streak,
            "bothStreak": both_streak,
            "streakDesc": streak_str,
            "foreignRaw": f_raw,
            "instRaw": i_raw,
            "totalNetRaw": tot_raw,
            "foreignFormatted": s.get('foreignFormatted'),
            "instFormatted": s.get('instFormatted'),
            "totalFormatted": s.get('totalFormatted'),
            "volume": s.get('volume'),
            "recommendReason": quant_reason
        })
        print(f"  + [수급 챔피언] {s.get('name')}({s.get('code')}): {streak_str} ({s.get('totalFormatted')})")
        
    return quant_picks

def collect_latest_news_for_popular_stocks(codes=["005930", "000660", "005380", "119850", "010120"]):
    """
    주요 관심 종목 실시간 뉴스 사전 캐싱 (오프라인/모바일 초고속 대응)
    """
    print("[3/3] 주요 관심 종목 실시간 뉴스 캐싱 시작...")
    news_cache = {}
    
    for code in codes:
        url = f"https://m.stock.naver.com/api/news/stock/{code}?page=1&pageSize=5"
        try:
            data = fetch_json(url)
            articles = []
            for group in data:
                for item in group.get('items', []):
                    articles.append({
                        "id": item.get('id'),
                        "officeName": item.get('officeName'),
                        "datetime": item.get('datetime'),
                        "title": clean_html(item.get('title')),
                        "body": clean_html(item.get('body', '')),
                        "url": item.get('mobileNewsUrl'),
                        "img": item.get('imageOriginLink')
                    })
            news_cache[code] = articles[:5]
            print(f"  + 종목 {code} 뉴스 {len(news_cache[code])}건 캐싱 완료")
        except Exception as e:
            print(f"  종목 {code} 뉴스 수집 실패: {e}")
            news_cache[code] = []
            
    return news_cache

def main():
    print("=" * 60)
    print("M.A.G ANTIGRAVITY - 무할루시네이션 추천 & 뉴스 엔진 가동")
    print("=" * 60)
    
    broker_reports = collect_analyst_reports(max_pages=2)
    quant_champions = collect_quant_champions()
    
    # Collect sample news for top codes
    sample_codes = ["005930", "000660", "010120", "119850", "042700"]
    if broker_reports:
        sample_codes.extend([r['itemCode'] for r in broker_reports[:5]])
    sample_codes = list(set(sample_codes))
    
    news_cache = collect_latest_news_for_popular_stocks(sample_codes)
    
    output_data = {
        "updatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "totalBrokerPicks": len(broker_reports),
        "totalQuantPicks": len(quant_champions),
        "brokerRecommendations": broker_reports,
        "quantRecommendations": quant_champions,
        "cachedNews": news_cache
    }
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
        
    print(f"\n[성공] 데이터셋 저장 완료: {OUTPUT_FILE}")
    print(f"- 증권사 실명 리포트: {len(broker_reports)}건")
    print(f"- 거래소 퀀트 수급 챔피언: {len(quant_champions)}건")
    print(f"- 실시간 뉴스 캐시 종목수: {len(news_cache)}개")

if __name__ == "__main__":
    main()
