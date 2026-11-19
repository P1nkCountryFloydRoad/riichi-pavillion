#!/usr/bin/env python3
"""最简单的 mjai 机器人：摸什么打什么，从不鸣牌。用来在没有 Mortal 的情况下测试桥接链路。

协议与 Mortal 的 mortal.py 一致：每行读一个事件；带 "can_act": false 的事件不回应，
否则对需要决策的事件回一行反应。同时校验事件的字段，格式不对时直接报错退出。
用法：python3 mjai_dummy_bot.py <seat>
"""
import json
import sys

TILE = {f'{n}{s}' for n in range(1, 10) for s in 'mps'} | {'5mr', '5pr', '5sr'} | set('ESWNPFC') | {'?'}
SPEC = {
    'start_game': {}, 'end_game': {}, 'end_kyoku': {},
    'start_kyoku': {'bakaze': 't', 'dora_marker': 't', 'kyoku': 'k', 'honba': 'n', 'kyotaku': 'n', 'oya': 'a', 'scores': 'scores', 'tehais': 'tehais'},
    'tsumo': {'actor': 'a', 'pai': 't'},
    'dahai': {'actor': 'a', 'pai': 't', 'tsumogiri': 'b'},
    'chi': {'actor': 'a', 'target': 'a', 'pai': 't', 'consumed': 2},
    'pon': {'actor': 'a', 'target': 'a', 'pai': 't', 'consumed': 2},
    'daiminkan': {'actor': 'a', 'target': 'a', 'pai': 't', 'consumed': 3},
    'kakan': {'actor': 'a', 'pai': 't', 'consumed': 3},
    'ankan': {'actor': 'a', 'consumed': 4},
    'dora': {'dora_marker': 't'},
    'reach': {'actor': 'a'}, 'reach_accepted': {'actor': 'a'},
    'hora': {'actor': 'a', 'target': 'a'},
    'ryukyoku': {},
}


def check(ev):
    t = ev.get('type')
    if t not in SPEC:
        raise ValueError(f'unknown event type {t!r}')
    for k, kind in SPEC[t].items():
        v = ev.get(k)
        ok = {
            't': lambda: v in TILE,
            'a': lambda: isinstance(v, int) and 0 <= v <= 3,
            'k': lambda: isinstance(v, int) and 1 <= v <= 4,
            'n': lambda: isinstance(v, int) and 0 <= v <= 255,
            'b': lambda: isinstance(v, bool),
            'scores': lambda: isinstance(v, list) and len(v) == 4 and all(isinstance(x, int) for x in v),
            'tehais': lambda: isinstance(v, list) and len(v) == 4 and all(len(h) == 13 and all(p in TILE for p in h) for h in v),
        }.get(kind, lambda: isinstance(v, list) and len(v) == kind and all(p in TILE for p in v))()
        if not ok:
            raise ValueError(f'bad field {k}={v!r} in {ev}')
    for k in ('deltas',):
        if k in ev and not (isinstance(ev[k], list) and len(ev[k]) == 4 and all(isinstance(x, int) for x in ev[k])):
            raise ValueError(f'bad {k} in {ev}')


def main():
    seat = int(sys.argv[-1])
    last = None
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        ev = json.loads(line)
        check(ev)
        if ev.get('type') == 'tsumo' and ev['actor'] == seat:
            last = ev['pai']
        if ev.get('can_act') is False:
            continue
        t = ev.get('type')
        if t == 'tsumo' and ev['actor'] == seat:
            out = {'type': 'dahai', 'actor': seat, 'pai': ev['pai'], 'tsumogiri': True}
        elif t == 'reach' and ev['actor'] == seat:
            out = {'type': 'dahai', 'actor': seat, 'pai': last, 'tsumogiri': True}
        elif t in ('chi', 'pon') and ev['actor'] == seat:
            raise ValueError('dummy bot never calls')
        else:
            out = {'type': 'none'}
        print(json.dumps(out), flush=True)


if __name__ == '__main__':
    main()
