'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { 
  PackagePlus, 
  Printer, 
  CheckCircle2, 
  Clock, 
  Truck, 
  AlertCircle, 
  RefreshCw, 
  Eye, 
  X, 
  MapPin, 
  Calendar 
} from 'lucide-react';

interface Delivery {
  id: string;
  code_colis: string;
  nom_client: string;
  adresse_livraison: string;
  code_postal: string;
  ville: string;
  telephone_client: string | null;
  instructions: string | null;
  statut: 'en_attente' | 'en_charge' | 'livre' | 'echec';
  date_creation: string;
}

interface DeliveryProof {
  id: string;
  delivery_id: string;
  signature_url: string | null;
  photo_url: string | null;
  nom_receptionnaire: string | null;
  latitude: number | null;
  longitude: number | null;
  motif_echec: string | null;
  date_validation: string;
}

export default function AtelierDashboard() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedColisForPrint, setSelectedColisForPrint] = useState<Delivery | null>(null);

  // État pour la consultation de preuve (POD)
  const [activeProof, setActiveProof] = useState<{ delivery: Delivery; proof: DeliveryProof | null } | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  // Formulaire
  const [nomClient, setNomClient] = useState('');
  const [adresse, setAdresse] = useState('');
  const [codePostal, setCodePostal] = useState('92500');
  const [ville, setVille] = useState('Rueil-Malmaison');
  const [telephone, setTelephone] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  const fetchDeliveries = async () => {
    const { data, error } = await supabase
      .from('deliveries')
      .select('*')
      .order('date_creation', { ascending: false });

    if (!error && data) {
      setDeliveries(data as Delivery[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDeliveries();

    const channel = supabase
      .channel('realtime_deliveries')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deliveries' },
        () => {
          fetchDeliveries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomClient || !adresse) return;

    setIsSubmitting(true);
    const uniqueCode = `LIV-${Math.floor(1000 + Math.random() * 9000)}`;

    const { data, error } = await supabase.from('deliveries').insert([
      {
        code_colis: uniqueCode,
        nom_client: nomClient,
        adresse_livraison: adresse,
        code_postal: codePostal,
        ville: ville,
        telephone_client: telephone || null,
        instructions: instructions || null,
        statut: 'en_attente',
      },
    ]).select().single();

    setIsSubmitting(false);

    if (error) {
      alert(`Erreur d'enregistrement : ${error.message}`);
      return;
    }

    if (data) {
      setSelectedColisForPrint(data as Delivery);
      setNomClient('');
      setAdresse('');
      setTelephone('');
      setInstructions('');
      fetchDeliveries();
    }
  };

  const handleOpenProof = async (colis: Delivery) => {
    setLoadingProof(true);
    setActiveProof({ delivery: colis, proof: null });

    const { data, error } = await supabase
      .from('delivery_proofs')
      .select('*')
      .eq('delivery_id', colis.id)
      .order('date_validation', { ascending: false })
      .limit(1)
      .single();

    if (!error && data) {
      setActiveProof({ delivery: colis, proof: data as DeliveryProof });
    }
    setLoadingProof(false);
  };

  const handlePrint = () => {
    window.print();
  };

  const getStatusBadge = (colis: Delivery) => {
    switch (colis.statut) {
      case 'en_attente':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <Clock className="w-3.5 h-3.5" /> À quai
          </span>
        );
      case 'en_charge':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            <Truck className="w-3.5 h-3.5" /> En tournée
          </span>
        );
      case 'livre':
        return (
          <button
            onClick={() => handleOpenProof(colis)}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors cursor-pointer"
            title="Clique pour voir la preuve de livraison"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Livré</span>
            <Eye className="w-3 h-3 ml-0.5 opacity-60" />
          </button>
        );
      case 'echec':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
            <AlertCircle className="w-3.5 h-3.5" /> Échec
          </span>
        );
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Imprimerie de Rueil — Gestion des Livraisons
          </h1>
          <p className="text-sm text-slate-500">Poste expédition & suivi atelier en direct</p>
        </div>
        <button
          onClick={fetchDeliveries}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 text-slate-700 self-start md:self-auto cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 print:hidden">
        {/* Formulaire de création */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
          <div className="flex items-center gap-2 mb-4 text-slate-900">
            <PackagePlus className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-lg">Enregistrer un colis</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Client / Société *
              </label>
              <input
                type="text"
                required
                value={nomClient}
                onChange={(e) => setNomClient(e.target.value)}
                placeholder="Ex. Cabinet Dupont"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Adresse de livraison *
              </label>
              <input
                type="text"
                required
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                placeholder="Ex. 14 rue de la Libération"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Code postal
                </label>
                <input
                  type="text"
                  value={codePostal}
                  onChange={(e) => setCodePostal(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Ville
                </label>
                <input
                  type="text"
                  value={ville}
                  onChange={(e) => setVille(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Téléphone contact
              </label>
              <input
                type="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="06 12 34 56 78"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Instructions / Réf. commande
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={2}
                placeholder="Ex. 500 brochures, déposer à l'accueil"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Création...' : 'Générer le bordereau & QR code'}
            </button>
          </form>
        </div>

        {/* Tableau de suivi */}
        <div className="lg:col-span-2 space-y-6">
          {selectedColisForPrint && (
            <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-white p-2 rounded-xl border border-indigo-100 shadow-sm">
                  <QRCodeSVG value={selectedColisForPrint.code_colis} size={84} />
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-indigo-700">{selectedColisForPrint.code_colis}</div>
                  <div className="font-bold text-slate-900">{selectedColisForPrint.nom_client}</div>
                  <div className="text-xs text-slate-600">
                    {selectedColisForPrint.adresse_livraison}, {selectedColisForPrint.code_postal} {selectedColisForPrint.ville}
                  </div>
                </div>
              </div>
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow transition-colors shrink-0 cursor-pointer"
              >
                <Printer className="w-4 h-4" /> Imprimer l’étiquette
              </button>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Tournées & Livraisons ({deliveries.length})</h3>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Chargement des données...</div>
            ) : deliveries.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Aucun colis enregistré pour le moment.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                    <tr>
                      <th className="px-4 py-3">Réf.</th>
                      <th className="px-4 py-3">Client & Adresse</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deliveries.map((colis) => (
                      <tr key={colis.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-xs text-slate-700">
                          {colis.code_colis}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{colis.nom_client}</div>
                          <div className="text-xs text-slate-500">
                            {colis.adresse_livraison}, {colis.code_postal} {colis.ville}
                          </div>
                          {colis.instructions && (
                            <div className="text-xs text-slate-400 italic mt-0.5">{colis.instructions}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(colis)}</td>
                        <td className="px-4 py-3 text-right space-x-1">
                          {colis.statut === 'livre' && (
                            <button
                              onClick={() => handleOpenProof(colis)}
                              className="p-1.5 text-slate-500 hover:text-emerald-600 rounded-md hover:bg-emerald-50 transition-colors inline-flex cursor-pointer"
                              title="Voir la preuve de livraison"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedColisForPrint(colis)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors inline-flex cursor-pointer"
                            title="Réimprimer l'étiquette"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODALE PREUVE DE LIVRAISON (POD) */}
      {activeProof && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl overflow-hidden animate-in fade-in">
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    {activeProof.delivery.code_colis}
                  </span>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    Livré
                  </span>
                </div>
                <h3 className="font-bold text-lg text-slate-900 mt-1">
                  {activeProof.delivery.nom_client}
                </h3>
              </div>
              <button
                onClick={() => setActiveProof(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingProof ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Chargement des éléments de preuve...
              </div>
            ) : !activeProof.proof ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Aucune preuve détaillée trouvée pour ce colis.
              </div>
            ) : (
              <div className="py-4 space-y-4 max-h-[75vh] overflow-y-auto pr-1">
                {/* Métadonnées */}
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl text-xs">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Réceptionné par</span>
                    <span className="font-semibold text-slate-800">
                      {activeProof.proof.nom_receptionnaire || 'Non précisé'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Date et heure</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {new Date(activeProof.proof.date_validation).toLocaleString('fr-FR')}
                    </span>
                  </div>
                </div>

                {/* Localisation GPS */}
                {activeProof.proof.latitude && activeProof.proof.longitude ? (
                  <div className="text-xs bg-slate-50 p-3 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 block mb-0.5">Point GPS de validation</span>
                      <span className="font-mono text-slate-700">
                        {activeProof.proof.latitude.toFixed(5)}, {activeProof.proof.longitude.toFixed(5)}
                      </span>
                    </div>
                    <a
                      href={`https://www.google.com/maps?q=${activeProof.proof.latitude},${activeProof.proof.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-semibold"
                    >
                      <MapPin className="w-3.5 h-3.5" /> Voir carte
                    </a>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic px-1">
                    Géolocalisation non disponible au moment du scan.
                  </div>
                )}

                {/* Signature */}
                <div>
                  <span className="text-xs font-semibold text-slate-700 block mb-1">
                    Signature du réceptionnaire
                  </span>
                  {activeProof.proof.signature_url ? (
                    <div className="border border-slate-200 rounded-xl bg-white p-2 flex items-center justify-center">
                      <img
                        src={activeProof.proof.signature_url}
                        alt="Signature de livraison"
                        className="max-h-40 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl text-center">
                      Pas de signature enregistrée
                    </div>
                  )}
                </div>

                {/* Photo de dépôt */}
                {activeProof.proof.photo_url && (
                  <div>
                    <span className="text-xs font-semibold text-slate-700 block mb-1">
                      Photo de preuve du dépôt
                    </span>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-black/5">
                      <img
                        src={activeProof.proof.photo_url}
                        alt="Photo de livraison"
                        className="w-full max-h-60 object-cover"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setActiveProof(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Impression papier */}
      {selectedColisForPrint && (
        <div ref={printRef} className="hidden print:block p-4 max-w-sm border-2 border-dashed border-black font-sans">
          <div className="text-center pb-2 border-b border-black">
            <h2 className="text-base font-black tracking-wide">IMPRIMERIE DE RUEIL</h2>
            <p className="text-[10px] text-black">Bordereau de livraison direct atelier</p>
          </div>

          <div className="flex items-center justify-center my-4">
            <QRCodeSVG value={selectedColisForPrint.code_colis} size={150} />
          </div>

          <div className="text-center font-mono font-extrabold text-lg mb-3">
            {selectedColisForPrint.code_colis}
          </div>

          <div className="space-y-1 text-xs border-t border-black pt-2">
            <div><span className="font-bold">Destinataire :</span> {selectedColisForPrint.nom_client}</div>
            <div><span className="font-bold">Adresse :</span> {selectedColisForPrint.adresse_livraison}</div>
            <div><span className="font-bold">Ville :</span> {selectedColisForPrint.code_postal} {selectedColisForPrint.ville}</div>
            {selectedColisForPrint.telephone_client && (
              <div><span className="font-bold">Tél :</span> {selectedColisForPrint.telephone_client}</div>
            )}
            {selectedColisForPrint.instructions && (
              <div className="pt-1 text-[11px] italic">
                <span className="font-bold not-italic">Note :</span> {selectedColisForPrint.instructions}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}