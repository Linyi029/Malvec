import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
// import MainPage from "./home";   
// import ReportPage from "./reportpage";  
// import EvaluationPage from "./evaluation";
import EvaluationPage from "./evaluation";
import MainPage from "./home";
import ReportPage from "./report";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/evaluation" element={<EvaluationPage />} />
      </Routes>
    </Router>
  );
}

