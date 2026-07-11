import {Navigate,Route,Routes} from "react-router";
import {session} from "../lib/api";
import {AppShell} from "../components/AppShell";
import {LoginPage} from "../pages/LoginPage";
import {DashboardPage} from "../pages/DashboardPage";
import {InvoicesPage} from "../pages/InvoicesPage";
import {PlaceholderPage} from "../pages/PlaceholderPage";
const Protected=()=>session.token()?<AppShell/>:<Navigate to="/login" replace/>;
export function App(){return <Routes><Route path="/login" element={<LoginPage/>}/><Route element={<Protected/>}><Route index element={<Navigate to="/dashboard" replace/>}/><Route path="/dashboard" element={<DashboardPage/>}/><Route path="/facturi" element={<InvoicesPage/>}/>{[["/facturi/noi","Emitere factură"],["/recurente","Facturi recurente"],["/clienti","Clienți"],["/conturi","Conturi bancare"],["/serii","Serii de facturare"],["/setari","Setări"]].map(([path,title])=><Route key={path} path={path} element={<PlaceholderPage title={title}/>}/>)}</Route><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Routes>}
