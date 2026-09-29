// Testler için küçük bir Redis: depoların Lua betikleri (EVAL) gerçekten çalıştırılır (fengari, JS'te Lua VM), veri
// bellekte tutulur. Yalnız depoların kullandığı komutlar vardır; bilinmeyen komut hata verir (sessiz geçmesin).
// Gerçek Redis'in yerini tutmaz (Lua 5.3, TTL yok sayılır); gerçek Redis duman testi depoSozlesmesi.test.ts'tedir.
import type { RedisCommand } from "@/lib/redis";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

type Deger = string | number | null | Deger[];

export function createLuaRedis() {
  const dizeler = new Map<string, string>();
  const listeler = new Map<string, string[]>();
  const tablolar = new Map<string, Map<string, string>>();
  const sil = (k: string) => Number(dizeler.delete(k)) + Number(listeler.delete(k)) + Number(tablolar.delete(k));
  const glob = (desen: string) => new RegExp("^" + desen.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");

  function calistir(args: string[]): Deger {
    const [ad, ...a] = args;
    switch (ad.toUpperCase()) {
      case "GET":
        return dizeler.get(a[0]) ?? null;
      case "SET": {
        const nx = a.slice(2).some((x) => x.toUpperCase() === "NX");
        if (nx && dizeler.has(a[0])) return null;
        dizeler.set(a[0], a[1]);
        return "OK";
      }
      case "MGET":
        return a.map((k) => dizeler.get(k) ?? null);
      case "DEL":
        return a.reduce((n, k) => n + (sil(k) ? 1 : 0), 0);
      case "EXISTS":
        return a.filter((k) => dizeler.has(k) || listeler.has(k) || tablolar.has(k)).length;
      case "LPUSH": {
        const l = listeler.get(a[0]) ?? [];
        l.unshift(...a.slice(1).reverse());
        listeler.set(a[0], l);
        return l.length;
      }
      case "LRANGE": {
        const l = listeler.get(a[0]) ?? [];
        const bas = Number(a[1]);
        const son = Number(a[2]) < 0 ? l.length + Number(a[2]) : Number(a[2]);
        return l.slice(bas, son + 1);
      }
      case "LTRIM": {
        const l = listeler.get(a[0]) ?? [];
        listeler.set(a[0], l.slice(Number(a[1]), Number(a[2]) + 1));
        return "OK";
      }
      case "LSET": {
        const l = listeler.get(a[0]);
        const i = Number(a[1]);
        if (!l || i < 0 || i >= l.length) throw new Error("ERR index out of range");
        l[i] = a[2];
        return "OK";
      }
      case "HSET": {
        const t = tablolar.get(a[0]) ?? new Map<string, string>();
        let yeni = 0;
        for (let i = 1; i + 1 < a.length; i += 2) {
          if (!t.has(a[i])) yeni++;
          t.set(a[i], a[i + 1]);
        }
        tablolar.set(a[0], t);
        return yeni;
      }
      case "HINCRBY": {
        const t = tablolar.get(a[0]) ?? new Map<string, string>();
        const yeni = Number(t.get(a[1]) ?? 0) + Number(a[2]);
        t.set(a[1], String(yeni));
        tablolar.set(a[0], t);
        return yeni;
      }
      case "HGETALL":
        return [...(tablolar.get(a[0]) ?? new Map<string, string>())].flat();
      case "PEXPIRE":
        return 1;
      case "HVALS":
        return [...(tablolar.get(a[0])?.values() ?? [])];
      case "SCAN": {
        const desen = a[a.findIndex((x) => x.toUpperCase() === "MATCH") + 1] ?? "*";
        const r = glob(desen);
        return ["0", [...dizeler.keys(), ...listeler.keys(), ...tablolar.keys()].filter((k) => r.test(k))];
      }
      case "EVAL":
        return eval_(a[0], Number(a[1]), a.slice(2));
      default:
        throw new Error(`luaRedis: desteklenmeyen komut ${ad}`);
    }
  }

  function it(L: unknown, v: Deger) {
    if (v === null) lua.lua_pushboolean(L, false);
    else if (typeof v === "number") lua.lua_pushinteger(L, v);
    else if (typeof v === "string") lua.lua_pushstring(L, to_luastring(v));
    else {
      lua.lua_createtable(L, v.length, 0);
      v.forEach((x, i) => {
        it(L, x);
        lua.lua_rawseti(L, -2, i + 1);
      });
    }
  }

  function oku(L: unknown, i: number): Deger {
    switch (lua.lua_type(L, i)) {
      case lua.LUA_TNUMBER:
        return lua.lua_tonumber(L, i);
      case lua.LUA_TSTRING:
        return to_jsstring(lua.lua_tolstring(L, i));
      case lua.LUA_TTABLE: {
        const out: Deger[] = [];
        for (let n = 1; ; n++) {
          lua.lua_rawgeti(L, i, n);
          if (lua.lua_isnil(L, -1)) {
            lua.lua_pop(L, 1);
            break;
          }
          out.push(oku(L, lua.lua_gettop(L)));
          lua.lua_pop(L, 1);
        }
        return out;
      }
      default:
        return null;
    }
  }

  function eval_(betik: string, anahtarSayisi: number, kalan: string[]): Deger {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const tablo = (ad: string, degerler: string[]) => {
      it(L, degerler);
      lua.lua_setglobal(L, to_luastring(ad));
    };
    tablo("KEYS", kalan.slice(0, anahtarSayisi));
    tablo("ARGV", kalan.slice(anahtarSayisi));
    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (L2: unknown) => {
      const n = lua.lua_gettop(L2);
      const args: string[] = [];
      for (let i = 1; i <= n; i++) args.push(lua.lua_type(L2, i) === lua.LUA_TNUMBER ? String(lua.lua_tonumber(L2, i)) : to_jsstring(lua.lua_tolstring(L2, i)));
      it(L2, calistir(args));
      return 1;
    });
    lua.lua_setfield(L, -2, to_luastring("call"));
    lua.lua_setglobal(L, to_luastring("redis"));
    if (lauxlib.luaL_loadstring(L, to_luastring(betik)) !== lua.LUA_OK || lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) {
      throw new Error(`Lua hatası: ${to_jsstring(lua.lua_tolstring(L, -1))}`);
    }
    return lua.lua_type(L, -1) === lua.LUA_TBOOLEAN ? (lua.lua_toboolean(L, -1) ? 1 : null) : oku(L, -1);
  }

  const command: RedisCommand = async (args) => calistir(args.map(String));
  return { command, dizeler, listeler, tablolar };
}
