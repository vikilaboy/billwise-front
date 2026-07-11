import {afterEach,describe,expect,it,vi} from "vitest";
import {ApiError,api} from "./api";
afterEach(()=>vi.restoreAllMocks());
describe("api client",()=>{it("păstrează anvelopa data",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{status:"ok"}}),{status:200})));await expect(api<{status:string}>("/health")).resolves.toEqual({data:{status:"ok"}})});it("transformă problem details în ApiError",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({title:"Date invalide",status:422,detail:"Email invalid"}),{status:422})));await expect(api("/auth/login")).rejects.toBeInstanceOf(ApiError)})});
