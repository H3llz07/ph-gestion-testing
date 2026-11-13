import { Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import { getToken, getUser, logout } from "./api.js";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Inmuebles from "./pages/Inmuebles.jsx";
import EstadoCuenta from "./pages/EstadoCuenta.jsx";
import Cartera from "./pages/Cartera.jsx";
import Recaudos from "./pages/Recaudos.jsx";
import Facturacion from "./pages/Facturacion.jsx";
import Reportes from "./pages/Reportes.jsx";

function Shell({ children }) {
  const user = getUser();
  const esAdministrativo = ["superadmin", "admin_copropiedad", "contador"].includes(user?.rol);
  const navigate = useNavigate();
  const salir = () => { logout(); navigate("/login"); };
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>PH Gestión</h1>
        <p className="sub">Propiedad horizontal</p>
        <nav>
          {esAdministrativo && <NavLink to="/" end>Dashboard</NavLink>}
          <NavLink to="/inmuebles">Inmuebles</NavLink>
          <NavLink to="/cartera">Cartera</NavLink>
          {esAdministrativo && <NavLink to="/facturacion">Facturación</NavLink>}
          {esAdministrativo && <NavLink to="/recaudos">Recaudos</NavLink>}
          {esAdministrativo && <NavLink to="/reportes">Reportes</NavLink>}
        </nav>
        <div className="logout">
          <div className="sub" style={{ marginBottom: 8 }}>{user?.nombres}</div>
          <button className="secondary" onClick={salir}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

function Private({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

function Administrative({ children }) {
  const user = getUser();
  if (!["superadmin", "admin_copropiedad", "contador"].includes(user?.rol)) {
    return <Navigate to="/inmuebles" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Private><Administrative><Dashboard /></Administrative></Private>} />
      <Route path="/inmuebles" element={<Private><Inmuebles /></Private>} />
      <Route path="/inmuebles/:id/estado-cuenta" element={<Private><EstadoCuenta /></Private>} />
      <Route path="/cartera" element={<Private><Cartera /></Private>} />
      <Route path="/facturacion" element={<Private><Administrative><Facturacion /></Administrative></Private>} />
      <Route path="/recaudos" element={<Private><Administrative><Recaudos /></Administrative></Private>} />
      <Route path="/reportes" element={<Private><Administrative><Reportes /></Administrative></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
