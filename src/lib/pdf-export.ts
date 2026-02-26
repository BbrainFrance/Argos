import { jsPDF } from "jspdf";
import { DashboardStats, Alert, AnalysisResult, OperationalMarker, Entity, ZoneOfInterest } from "@/types";

interface ReportData {
  stats: DashboardStats;
  alerts: Alert[];
  analyses: AnalysisResult[];
  markers: OperationalMarker[];
  entities: Entity[];
  zones: ZoneOfInterest[];
  aiBrief?: string;
}

function formatDate(): string {
  const d = new Date();
  const months = ["JAN", "FEV", "MAR", "AVR", "MAI", "JUN", "JUL", "AOU", "SEP", "OCT", "NOV", "DEC"];
  return `${d.getDate().toString().padStart(2, "0")}${months[d.getMonth()]}${d.getFullYear()} ${d.getHours().toString().padStart(2, "0")}${d.getMinutes().toString().padStart(2, "0")}Z`;
}

export function generateReport(data: ReportData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 15;
  const marginL = 15;
  const contentW = pageW - 30;

  const addPageIfNeeded = (requiredSpace: number) => {
    if (y + requiredSpace > 270) {
      doc.addPage();
      y = 15;
    }
  };

  // Header
  doc.setFillColor(20, 30, 50);
  doc.rect(0, 0, pageW, 35, "F");
  doc.setTextColor(0, 212, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("ARGOS", marginL, 18);
  doc.setFontSize(8);
  doc.setTextColor(150, 160, 180);
  doc.text("SYSTEME SOUVERAIN DE RENSEIGNEMENT", marginL, 24);
  doc.setTextColor(100, 120, 140);
  doc.setFontSize(7);
  doc.text(`RAPPORT GENERE LE ${formatDate()}`, marginL, 30);
  doc.text("CLASSIFICATION: DIFFUSION RESTREINTE", pageW - marginL - 80, 30);

  y = 42;

  // Classification bar
  doc.setFillColor(200, 60, 60);
  doc.rect(0, 36, pageW, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(6);
  doc.text("DIFFUSION RESTREINTE — PERSONNEL HABILITE UNIQUEMENT", pageW / 2, 39, { align: "center" });

  // Situation
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("1. SITUATION GENERALE", marginL, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const situations = [
    `Aeronefs detectes: ${data.stats.totalAircraft} (${data.stats.activeFlights} en vol)`,
    `Navires detectes: ${data.stats.totalVessels}`,
    `Altitude moyenne: ${data.stats.avgAltitude.toLocaleString("fr-FR")} m`,
    `Vitesse moyenne: ${data.stats.avgSpeed.toLocaleString("fr-FR")} km/h`,
    `Alertes actives: ${data.stats.activeAlerts}`,
    `Entites sous surveillance: ${data.stats.trackedEntities}`,
    `Pays detectes: ${data.stats.countriesDetected.join(", ") || "N/A"}`,
  ];

  situations.forEach((s) => {
    doc.text(`• ${s}`, marginL + 3, y);
    y += 5;
  });

  y += 5;

  // Alerts
  addPageIfNeeded(30);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("2. ALERTES", marginL, y);
  y += 7;

  const unack = data.alerts.filter((a) => !a.acknowledged);
  if (unack.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Aucune alerte active.", marginL + 3, y);
    y += 5;
  } else {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    unack.slice(0, 15).forEach((a) => {
      addPageIfNeeded(8);
      const severityColor = a.type === "critical" ? [200, 40, 40] : a.type === "danger" ? [200, 100, 40] : a.type === "warning" ? [200, 180, 40] : [100, 140, 200];
      doc.setTextColor(severityColor[0], severityColor[1], severityColor[2]);
      doc.text(`[${a.type.toUpperCase()}]`, marginL + 3, y);
      doc.setTextColor(0, 0, 0);
      doc.text(`${a.title}`, marginL + 25, y);
      y += 4;
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(7);
      const msgLines = doc.splitTextToSize(a.message, contentW - 25);
      doc.text(msgLines, marginL + 25, y);
      y += msgLines.length * 3.5 + 2;
      doc.setFontSize(8);
    });
  }

  y += 5;

  // Analyses
  addPageIfNeeded(30);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("3. ANALYSES", marginL, y);
  y += 7;

  if (data.analyses.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Aucune anomalie detectee.", marginL + 3, y);
    y += 5;
  } else {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    data.analyses.slice(0, 15).forEach((a) => {
      addPageIfNeeded(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`• [${a.severity.toUpperCase()}] ${a.title}`, marginL + 3, y);
      y += 4;
      doc.setTextColor(80, 80, 80);
      const descLines = doc.splitTextToSize(a.description, contentW - 10);
      doc.text(descLines, marginL + 8, y);
      y += descLines.length * 3.5 + 2;
    });
  }

  y += 5;

  // Operational markers
  if (data.markers.length > 0) {
    addPageIfNeeded(30);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("4. DEPLOIEMENT OPERATIONNEL", marginL, y);
    y += 7;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    data.markers.forEach((m) => {
      addPageIfNeeded(10);
      const affLabel = m.affiliation === "friendly" ? "AMI" : m.affiliation === "hostile" ? "HOSTILE" : "NEUTRE";
      doc.text(`• [${affLabel}] ${m.label} — ${m.category.toUpperCase()} — ${m.position.lat.toFixed(4)}N ${m.position.lng.toFixed(4)}E`, marginL + 3, y);
      y += 4;
      if (m.notes) {
        doc.setTextColor(80, 80, 80);
        doc.text(`  ${m.notes}`, marginL + 8, y);
        doc.setTextColor(0, 0, 0);
        y += 4;
      }
      if (m.weaponRange) {
        doc.text(`  Portee: ${m.weaponRange} km`, marginL + 8, y);
        y += 4;
      }
    });
    y += 5;
  }

  // AI Brief
  if (data.aiBrief) {
    addPageIfNeeded(40);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`${data.markers.length > 0 ? "5" : "4"}. BRIEF IA`, marginL, y);
    y += 7;

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const briefLines = doc.splitTextToSize(data.aiBrief, contentW);
    briefLines.forEach((line: string) => {
      addPageIfNeeded(5);
      doc.text(line, marginL + 3, y);
      y += 3.5;
    });
  }

  // Footer on each page
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(20, 30, 50);
    doc.rect(0, 287, pageW, 10, "F");
    doc.setTextColor(100, 120, 140);
    doc.setFontSize(6);
    doc.text(`ARGOS — Rapport de situation — ${formatDate()}`, marginL, 293);
    doc.text(`Page ${i}/${totalPages}`, pageW - marginL - 15, 293);
  }

  doc.save(`ARGOS_RAPPORT_${new Date().toISOString().slice(0, 10)}.pdf`);
}
