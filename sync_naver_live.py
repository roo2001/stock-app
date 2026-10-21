#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import json
import urllib.request
import re

def fetch_naver(code):
    try:
        # 1. basic info (price, rate, volume, tradeValue)
        u1 = f"https://m.stock.naver.com/api/stock/{code}/basic"
        req1 = urllib.request.Request(u1, headers={"User-Agent": "Mozilla/5.0"})
        d1 = json.loads(urllib.request.urlopen(req1, timeout=5).read())
        
        # 2. integration info (foreign, inst)
        u2 = f"https://m.stock.naver.com/api/stock/{code}/integration"
        req2 = urllib.request.Request(u2, headers={"User-Agent": "Mozilla/5.0"})
        d2 = json.loads(urllib.request.urlopen(req2, timeout=5).read())
        
        price = int(str(d1.get("closePrice") or d1.get("nowPrice") or 0).replace(",", ""))
        change = int(str(d1.get("compareToPreviousClosePrice") or d1.get("changePrice") or 0).replace(",", ""))
        rate = float(str(d1.get("fluctuationsRatio") or d1.get("changeRate") or 0.0).replace(",", ""))
        
        cmp_name = d1.get("compareToPreviousPrice", {}).get("name", "")
        if cmp_name in ["하락", "하한"]:
            if rate > 0: rate = -rate
            if change > 0: change = -change
            
        vol = int(str(d1.get("accumulatedTradingVolume") or 0).replace(",", ""))
        val = int(str(d1.get("accumulatedTradingValue") or 0).replace(",", ""))
        trade_val_eok = round(val / 100000000) if val > 100000000 else 0
        if trade_val_eok == 0 and d1.get("accumulatedTradingValueHangeul"):
            m = re.search(r"(\d+)억", d1["accumulatedTradingValueHangeul"])
            if m: trade_val_eok = int(m.group(1))

        deals = d2.get("dealTrendInfos", [{}])
        deal = deals[0] if deals else {}
        f_val = deal.get("foreignerPureBuyQuant")
        i_val = deal.get("organPureBuyQuant")
        
        def fmt_q(v):
            if not v or v == "-": return "-"
            num = int(str(v).replace(",", ""))
            sign = "+" if num > 0 else ""
            abs_n = abs(num)
            if abs_n >= 10000: return f"{sign}{abs_n/10000:.1f}만"
            elif abs_n >= 1000: return f"{sign}{abs_n/1000:.1f}천"
            else: return f"{sign}{abs_n}"

        return {
            "price": price,
            "change": change,
            "rate": rate,
            "volume": vol,
            "tradeValue": trade_val_eok,
            "foreign": fmt_q(f_val),
            "inst": fmt_q(i_val)
        }
    except Exception as e:
        print(f"Error for {code}: {e}")
        return None

def main():
    path = os.path.join(os.path.dirname(__file__), "watchlist.json")
    with open(path, "r", encoding="utf-8") as f:
        items = json.load(f)

    updated = 0
    for idx, item in enumerate(items):
        code = item.get("code")
        if code and code != "000000":
            live = fetch_naver(code)
            if live:
                if live["price"] > 0: item["price"] = live["price"]
                item["change"] = live["change"]
                item["rate"] = live["rate"]
                if live["volume"] > 0: item["volume"] = live["volume"]
                if live["tradeValue"] > 0: item["tradeValue"] = live["tradeValue"]
                item["foreign"] = live["foreign"]
                item["inst"] = live["inst"]
                updated += 1
                name = item.get("name", "")
                p = live["price"]
                r = live["rate"]
                f_q = live["foreign"]
                i_q = live["inst"]
                print(f"[{updated}/{len(items)}] {name}({code}): {p:,}원 ({r:+.2f}%) 외인:{f_q} 기관:{i_q}")

    with open(path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

    print(f"\n총 {updated}개 종목의 네이버 실시간 시장가 및 외국인/기관 수급 반영 완료!")

if __name__ == "__main__":
    main()
