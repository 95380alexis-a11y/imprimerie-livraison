'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Scanner } from '@yudiel/react-qr-scanner';
import SignatureCanvas from 'react-signature-canvas';
import { 
  Truck, 
  QrCode, 
  MapPin, 
  CheckCircle, 
  Navigation, 
  Phone, 
  Camera, 
  X, 
  Check, 
  AlertTriangle 
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
}

export default function LivreurPage() {
  const [tournee, setTournee] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [activeDelivery, setActiveDelivery] = useState<Delivery | null>(null);
  const [validating, setValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Preuve de livraison
  const [nomRecepteur, setNomRecepteur] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const sigPadRef = useRef<SignatureCanvas | null>(null);

  // Charger les colis en tournée ou en attente
  const fetchColis = async () => {
    const { data } = await supabase
      .from('deliveries')
      .select('*')
      .in('statut', ['en_attente', 'en_charge'])
      .order('date_creation', { ascending: false });

    if (data) setTournee(data as Delivery[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchColis();
  }, []);

  // 1. Scan pour prise en charge (Chargement dans le camion)
  const handleScanLoad = async (scannedCode: string) => {
    if (!scannedCode) return;
    setShowScanner(false);

    const { data, error } = await supabase
      .from('deliveries')
      .update({ statut: 'en_charge' })
      .eq('code_colis', scannedCode.trim())
      .select()
      .single();

    if (error || !data) {
      alert(`Colis introuvable ou erreur : ${scannedCode}`);
    } else {
      alert(` Colis ${data.code_colis} chargé dans la tournée !`);
      fetchColis();
    }
  };

  // Convertir le dessin de signature en fichier pour Supabase Storage
  const getSignatureBlob = async (): Promise<Blob | null> => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) return null;
    const canvas = sigPadRef.current.getTrimmedCanvas();
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  };

  // 2. Validation finale de la livraison sur le terrain
  const handleValidateDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDelivery) return;
    setValidating(true);
    setErrorMsg('');

    try {
      let signatureUrl: string | null = null;
      let photoUrl: string | null = null;

      // Récupération de la géolocalisation
      let latitude: number | null = null;
      let longitude: number | null = null;

      if ('geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        } catch (e) {
          console.warn('Géolocalisation refusée ou indisponible');
        }
      }

      // Envoi de la signature sur Supabase Storage
      const sigBlob = await getSignatureBlob();
      if (sigBlob) {
        const sigPath = `signatures/${activeDelivery.code_colis}-${Date.now()}.png`;
        const { error: sigErr } = await supabase.storage
          .from('pod-proofs')
          .upload(sigPath, sigBlob);

        if (!sigErr) {
          const { data } = supabase.storage.from('pod-proofs').getPublicUrl(sigPath);
          signatureUrl = data.publicUrl;
        }
      }

      // Envoi de la photo sur Supabase Storage
      if (photoFile) {
        const photoPath = `photos/${activeDelivery.code_colis}-${Date.now()}.jpg`;
        const { error: photoErr } = await supabase.storage
          .from('pod-proofs')
          .upload(photoPath, photoFile);

        if (!photoErr) {
          const { data } = supabase.storage.from('pod-proofs').getPublicUrl(photoPath);
          photoUrl = data.publicUrl;
        }
      }

      // Enregistrement de la preuve en base
      await supabase.from('delivery_proofs').insert([
        {
          delivery_id: activeDelivery.id,
          nom_receptionnaire: nomRecepteur || null,
          signature_url: signatureUrl,
          photo_url: photoUrl,
          latitude,
          longitude,
        },
      ]);

      // Mise à jour du statut du colis
      await supabase
        .from('deliveries')
        .update({ statut: 'livre' })
        .eq('id', activeDelivery.id);

      // Fermeture modale et mise à jour
      setActiveDelivery(null);
      setNomRecepteur('');
      setPhotoFile(null);
      fetchColis();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de la validation.');
    } finally {
      setValidating(false);
    }
  };

  const colisEnTournee = tournee.filter((c) => c.statut === 'en_charge');
  const colisAQuai = tournee.filter((c) => c.statut === 'en_attente');

  return (
    <div className="min-h-screen bg-slate-100 pb-20 text-slate-900 font-sans max-w-md mx-auto shadow-2xl border-x border-slate-200">
      {/* En-tête mobile */}
      <header className="bg-indigo-600 text-white p-4 sticky top-0 z-20 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <Truck className="w-6 h-6" />
          <h1 className="font-bold text-lg">Espace Livreur</h1>
        </div>
        <button
          onClick={() => setShowScanner(!showScanner)}
          className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-xl flex items-center gap-1.5 text-xs font-semibold backdrop-blur-sm transition-all"
        >
          <QrCode className="w-4 h-4" />
          {showScanner ? 'Fermer' : 'Charger'}
        </button>
      </header>

      {/* Caméra Scanner QR Code */}
      {showScanner && (
        <div className="p-4 bg-slate-900 text-white animate-in fade-in">
          <p className="text-xs text-center text-slate-300 mb-2 font-medium">
            Pointe la caméra sur le QR code du colis à charger
          </p>
          <div className="rounded-2xl overflow-hidden border-2 border-indigo-400 max-w-xs mx-auto aspect-square">
            <Scanner
              onScan={(result) => {
                if (result && result[0]?.rawValue) {
                  handleScanLoad(result[0].rawValue);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Liste des colis de la tournée */}
      <div className="p-4 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Dans le camion ({colisEnTournee.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-4 text-center text-xs text-slate-500">Chargement...</div>
          ) : colisEnTournee.length === 0 ? (
            <div className="bg-white p-6 rounded-2xl text-center border border-slate-200 text-xs text-slate-500 shadow-sm">
              Aucun colis chargé. Scanne les colis à quai avant de partir.
            </div>
          ) : (
            <div className="space-y-3">
              {colisEnTournee.map((colis) => (
                <div key={colis.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md">
                      {colis.code_colis}
                    </span>
                    <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      En route
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-base">{colis.nom_client}</h3>
                  <p className="text-xs text-slate-600 mt-0.5 flex items-start gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    {colis.adresse_livraison}, {colis.code_postal} {colis.ville}
                  </p>

                  {colis.instructions && (
                    <p className="text-xs bg-amber-50 text-amber-900 p-2 rounded-lg mt-2 border border-amber-200">
                      Note : {colis.instructions}
                    </p>
                  )}

                  {/* Actions rapides */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                        `${colis.adresse_livraison}, ${colis.code_postal}${colis.ville}`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 inline-flex justify-center items-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5 text-indigo-600" /> GPS
                    </a>

                    {colis.telephone_client && (
                      <a
                        href={`tel:${colis.telephone_client}`}
                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition-colors"
                      >
                        <Phone className="w-4 h-4 text-emerald-600" />
                      </a>
                    )}

                    <button
                      onClick={() => setActiveDelivery(colis)}
                      className="flex-1 inline-flex justify-center items-center gap-1.5 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Livrer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section des colis encore à quai à l'atelier */}
        {colisAQuai.length > 0 && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              En attente à l'atelier ({colisAQuai.length})
            </h2>
            <div className="space-y-2">
              {colisAQuai.map((colis) => (
                <div key={colis.id} className="bg-white/70 p-3 rounded-xl border border-dashed border-slate-300 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-mono font-bold text-slate-700 mr-2">{colis.code_colis}</span>
                    <span className="text-slate-800 font-medium">{colis.nom_client}</span>
                  </div>
                  <button
                    onClick={() => handleScanLoad(colis.code_colis)}
                    className="text-[11px] font-semibold text-indigo-600 hover:underline"
                  >
                    + Charger
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODALE PREUVE DE LIVRAISON (POD) */}
      {activeDelivery && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Preuve de livraison</h3>
                <p className="text-xs text-slate-500">{activeDelivery.code_colis} — {activeDelivery.nom_client}</p>
              </div>
              <button onClick={() => setActiveDelivery(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleValidateDelivery} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nom du réceptionnaire
                </label>
                <input
                  type="text"
                  value={nomRecepteur}
                  onChange={(e) => setNomRecepteur(e.target.value)}
                  placeholder="Ex. M. Martin (Gardien / Accueil)"
                  className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>

              {/* Photo du colis déposé */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Photo du dépôt (optionnelle mais conseillée)
                </label>
                <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 text-slate-600">
                  <Camera className="w-4 h-4 text-indigo-600" />
                  <span>{photoFile ? photoFile.name : 'Prendre une photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && setPhotoFile(e.target.files[0])}
                  />
                </label>
              </div>

              {/* Signature sur écran tactile */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-semibold text-slate-700">Signature du client</label>
                  <button
                    type="button"
                    onClick={() => sigPadRef.current?.clear()}
                    className="text-[10px] text-indigo-600 hover:underline"
                  >
                    Effacer
                  </button>
                </div>
                <div className="border border-slate-300 rounded-xl bg-slate-50 overflow-hidden">
                  <SignatureCanvas
                    ref={sigPadRef}
                    penColor="black"
                    canvasProps={{
                      className: 'w-full h-36',
                    }}
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={validating}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                {validating ? 'Validation en cours...' : <><Check className="w-4 h-4" /> Valider la remise du colis</>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}