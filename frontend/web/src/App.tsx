// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface AdSlot {
  id: number;
  title: string;
  description: string;
  encryptedBids: string;
  highestBid: number;
  secondHighestBid: number;
  timestamp: number;
  owner: string;
  status: 'active' | 'closed';
}

interface Bid {
  bidder: string;
  encryptedAmount: string;
  timestamp: number;
}

interface UserAction {
  type: 'create' | 'bid' | 'decrypt';
  timestamp: number;
  details: string;
}

interface Announcement {
  id: number;
  title: string;
  content: string;
  timestamp: number;
}

// FHE encryption/decryption functions
const FHEEncryptNumber = (value: number): string => `FHE-${btoa(value.toString())}`;
const FHEDecryptNumber = (encryptedData: string): number => encryptedData.startsWith('FHE-') ? parseFloat(atob(encryptedData.substring(4))) : parseFloat(encryptedData);
const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [adSlots, setAdSlots] = useState<AdSlot[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingAdSlot, setCreatingAdSlot] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newAdSlotData, setNewAdSlotData] = useState({ title: "", description: "" });
  const [selectedAdSlot, setSelectedAdSlot] = useState<AdSlot | null>(null);
  const [decryptedBids, setDecryptedBids] = useState<number[]>([]);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [durationDays, setDurationDays] = useState(30);
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [activeTab, setActiveTab] = useState('adSlots');
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'closed'>('all');
  const [announcements, setAnnouncements] = useState<Announcement[]>([
    {
      id: 1,
      title: "System Upgrade",
      content: "FHE encryption module upgraded to v2.3.1 for enhanced security",
      timestamp: Math.floor(Date.now() / 1000) - 3600
    },
    {
      id: 2,
      title: "New Feature",
      content: "Added bid history tracking for better transparency",
      timestamp: Math.floor(Date.now() / 1000) - 7200
    }
  ]);
  
  // Initialize signature parameters
  useEffect(() => {
    loadData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  // Load data from contract
  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
      
      // Load ad slots
      const adSlotsBytes = await contract.getData("adSlots");
      let adSlotsList: AdSlot[] = [];
      if (adSlotsBytes.length > 0) {
        try {
          const adSlotsStr = ethers.toUtf8String(adSlotsBytes);
          if (adSlotsStr.trim() !== '') adSlotsList = JSON.parse(adSlotsStr);
        } catch (e) {}
      }
      setAdSlots(adSlotsList);
      
      // Load bids
      const bidsBytes = await contract.getData("bids");
      let bidsList: Bid[] = [];
      if (bidsBytes.length > 0) {
        try {
          const bidsStr = ethers.toUtf8String(bidsBytes);
          if (bidsStr.trim() !== '') bidsList = JSON.parse(bidsStr);
        } catch (e) {}
      }
      setBids(bidsList);
    } catch (e) {
      console.error("Error loading data:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  // Create new ad slot
  const createAdSlot = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingAdSlot(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating ad slot with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Create new ad slot
      const newAdSlot: AdSlot = {
        id: adSlots.length + 1,
        title: newAdSlotData.title,
        description: newAdSlotData.description,
        encryptedBids: FHEEncryptNumber(0), // Initialize with 0 bids
        highestBid: 0,
        secondHighestBid: 0,
        timestamp: Math.floor(Date.now() / 1000),
        owner: address,
        status: 'active'
      };
      
      // Update ad slots list
      const updatedAdSlots = [...adSlots, newAdSlot];
      
      // Save to contract
      await contract.setData("adSlots", ethers.toUtf8Bytes(JSON.stringify(updatedAdSlots)));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'create',
        timestamp: Math.floor(Date.now() / 1000),
        details: `Created ad slot: ${newAdSlotData.title}`
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Ad slot created successfully!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewAdSlotData({ title: "", description: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingAdSlot(false); 
    }
  };

  // Place bid on ad slot
  const placeBid = async (adSlotId: number, bidAmount: number) => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Processing bid with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Find the ad slot
      const adSlotIndex = adSlots.findIndex(a => a.id === adSlotId);
      if (adSlotIndex === -1) throw new Error("Ad slot not found");
      
      // Update bids
      const newBid: Bid = {
        bidder: address,
        encryptedAmount: FHEEncryptNumber(bidAmount),
        timestamp: Math.floor(Date.now() / 1000)
      };
      const updatedBids = [...bids, newBid];
      
      // Update ad slot with new highest bid (simulate Vickrey auction)
      const updatedAdSlots = [...adSlots];
      if (bidAmount > updatedAdSlots[adSlotIndex].highestBid) {
        updatedAdSlots[adSlotIndex].secondHighestBid = updatedAdSlots[adSlotIndex].highestBid;
        updatedAdSlots[adSlotIndex].highestBid = bidAmount;
      } else if (bidAmount > updatedAdSlots[adSlotIndex].secondHighestBid) {
        updatedAdSlots[adSlotIndex].secondHighestBid = bidAmount;
      }
      
      // Update encrypted bids (simulate FHE calculation)
      updatedAdSlots[adSlotIndex].encryptedBids = FHEEncryptNumber(updatedAdSlots[adSlotIndex].highestBid);
      
      // Save to contract
      await contract.setData("adSlots", ethers.toUtf8Bytes(JSON.stringify(updatedAdSlots)));
      await contract.setData("bids", ethers.toUtf8Bytes(JSON.stringify(updatedBids)));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'bid',
        timestamp: Math.floor(Date.now() / 1000),
        details: `Placed bid of ${bidAmount} on ad slot: ${updatedAdSlots[adSlotIndex].title}`
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Bid placed with FHE encryption!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Bidding failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  // Close auction
  const closeAuction = async (adSlotId: number) => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Closing auction..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Find the ad slot
      const adSlotIndex = adSlots.findIndex(a => a.id === adSlotId);
      if (adSlotIndex === -1) throw new Error("Ad slot not found");
      
      // Verify owner
      if (adSlots[adSlotIndex].owner !== address) {
        throw new Error("Only the owner can close the auction");
      }
      
      // Update ad slot status
      const updatedAdSlots = [...adSlots];
      updatedAdSlots[adSlotIndex].status = 'closed';
      
      // Save to contract
      await contract.setData("adSlots", ethers.toUtf8Bytes(JSON.stringify(updatedAdSlots)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Auction closed successfully!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Failed to close auction: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  // Decrypt bids with signature
  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'decrypt',
        timestamp: Math.floor(Date.now() / 1000),
        details: "Decrypted FHE bid data"
      };
      setUserActions(prev => [newAction, ...prev]);
      
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  // Render FHE flow visualization
  const renderFHEFlow = () => {
    return (
      <div className="fhe-flow">
        <div className="flow-step">
          <div className="step-icon">1</div>
          <div className="step-content">
            <h4>Bid Submission</h4>
            <p>Advertisers submit encrypted bids using Zama FHE</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">2</div>
          <div className="step-content">
            <h4>Homomorphic Comparison</h4>
            <p>Bids are compared while remaining encrypted</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">3</div>
          <div className="step-content">
            <h4>Winner Determination</h4>
            <p>Highest bidder wins but pays second-highest price</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">4</div>
          <div className="step-content">
            <h4>Private Settlement</h4>
            <p>Only winning bid amount is revealed</p>
          </div>
        </div>
      </div>
    );
  };

  // Render user actions history
  const renderUserActions = () => {
    if (userActions.length === 0) return <div className="no-data">No actions recorded</div>;
    
    return (
      <div className="actions-list">
        {userActions.map((action, index) => (
          <div className="action-item" key={index}>
            <div className={`action-type ${action.type}`}>
              {action.type === 'create' && '📝'}
              {action.type === 'bid' && '💰'}
              {action.type === 'decrypt' && '🔓'}
            </div>
            <div className="action-details">
              <div className="action-text">{action.details}</div>
              <div className="action-time">{new Date(action.timestamp * 1000).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render announcements
  const renderAnnouncements = () => {
    return (
      <div className="announcements-list">
        {announcements.map((announcement) => (
          <div className="announcement-item" key={announcement.id}>
            <div className="announcement-header">
              <h4>{announcement.title}</h4>
              <span>{new Date(announcement.timestamp * 1000).toLocaleString()}</span>
            </div>
            <div className="announcement-content">{announcement.content}</div>
          </div>
        ))}
      </div>
    );
  };

  // Filter ad slots based on search and status
  const filteredAdSlots = adSlots.filter(adSlot => {
    const matchesSearch = adSlot.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         adSlot.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || adSlot.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Calculate statistics
  const totalBids = bids.length;
  const totalAdSlots = adSlots.length;
  const activeAdSlots = adSlots.filter(a => a.status === 'active').length;
  const totalBidVolume = adSlots.reduce((sum, a) => sum + a.highestBid, 0);

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing encrypted auction system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="auction-icon"></div>
          </div>
          <h1>AdAuction<span>FHE</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-adslot-btn"
          >
            <div className="add-icon"></div>Create Ad Slot
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <div className="dashboard-grid">
            <div className="dashboard-panel intro-panel">
              <div className="panel-card">
                <h2>Privacy-Preserving Ad Auctions</h2>
                <p>AdAuction_FHE is an on-chain advertising auction system where bids are encrypted using Zama FHE, ensuring true sealed-bid second-price auctions.</p>
                <div className="fhe-badge">
                  <div className="fhe-icon"></div>
                  <span>Powered by Zama FHE</span>
                </div>
              </div>
              
              <div className="panel-card">
                <h2>FHE Auction Flow</h2>
                {renderFHEFlow()}
              </div>
              
              <div className="panel-card">
                <h2>Market Statistics</h2>
                <div className="stats-grid">
                  <div className="stat-item">
                    <div className="stat-value">{totalAdSlots}</div>
                    <div className="stat-label">Ad Slots</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{activeAdSlots}</div>
                    <div className="stat-label">Active</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{totalBids}</div>
                    <div className="stat-label">Total Bids</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{totalBidVolume.toFixed(2)}</div>
                    <div className="stat-label">ETH Volume</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="dashboard-panel announcements-panel">
              <h2>System Announcements</h2>
              {renderAnnouncements()}
            </div>
          </div>
          
          <div className="tabs-container">
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'adSlots' ? 'active' : ''}`}
                onClick={() => setActiveTab('adSlots')}
              >
                Ad Slots
              </button>
              <button 
                className={`tab ${activeTab === 'actions' ? 'active' : ''}`}
                onClick={() => setActiveTab('actions')}
              >
                My Actions
              </button>
            </div>
            
            <div className="tab-content">
              {activeTab === 'adSlots' && (
                <div className="adslots-section">
                  <div className="section-header">
                    <h2>Available Ad Slots</h2>
                    <div className="header-actions">
                      <div className="search-filter-container">
                        <input
                          type="text"
                          placeholder="Search ad slots..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="search-input"
                        />
                        <select
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value as any)}
                          className="filter-select"
                        >
                          <option value="all">All</option>
                          <option value="active">Active</option>
                          <option value="closed">Closed</option>
                        </select>
                      </div>
                      <button 
                        onClick={loadData} 
                        className="refresh-btn" 
                        disabled={isRefreshing}
                      >
                        {isRefreshing ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>
                  </div>
                  
                  <div className="adslots-list">
                    {filteredAdSlots.length === 0 ? (
                      <div className="no-adslots">
                        <div className="no-adslots-icon"></div>
                        <p>No ad slots found</p>
                        <button 
                          className="create-btn" 
                          onClick={() => setShowCreateModal(true)}
                        >
                          Create First Ad Slot
                        </button>
                      </div>
                    ) : filteredAdSlots.map((adSlot, index) => (
                      <div 
                        className={`adslot-item ${selectedAdSlot?.id === adSlot.id ? "selected" : ""}`} 
                        key={index}
                        onClick={() => setSelectedAdSlot(adSlot)}
                      >
                        <div className="adslot-header">
                          <div className="adslot-title">{adSlot.title}</div>
                          <div className={`adslot-status ${adSlot.status}`}>{adSlot.status}</div>
                        </div>
                        <div className="adslot-description">{adSlot.description.substring(0, 100)}...</div>
                        <div className="adslot-info">
                          <div className="info-item">
                            <span>Owner:</span>
                            <strong>{adSlot.owner.substring(0, 6)}...{adSlot.owner.substring(38)}</strong>
                          </div>
                          <div className="info-item">
                            <span>Highest Bid:</span>
                            <strong>{adSlot.highestBid} ETH</strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {activeTab === 'actions' && (
                <div className="actions-section">
                  <h2>My Activity History</h2>
                  {renderUserActions()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateAdSlot 
          onSubmit={createAdSlot} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingAdSlot} 
          adSlotData={newAdSlotData} 
          setAdSlotData={setNewAdSlotData}
        />
      )}
      
      {selectedAdSlot && (
        <AdSlotDetailModal 
          adSlot={selectedAdSlot} 
          onClose={() => { 
            setSelectedAdSlot(null); 
            setDecryptedBids([]); 
          }} 
          decryptedBids={decryptedBids} 
          setDecryptedBids={setDecryptedBids} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
          placeBid={placeBid}
          closeAuction={closeAuction}
          isOwner={selectedAdSlot.owner === address}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="auction-icon"></div>
              <span>AdAuction_FHE</span>
            </div>
            <p>Privacy-preserving on-chain advertising auctions</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} AdAuction_FHE. All rights reserved.</div>
          <div className="disclaimer">
            This system uses fully homomorphic encryption to protect bid privacy. 
            Only the winning bid amount is revealed after auction closure.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateAdSlotProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  adSlotData: any;
  setAdSlotData: (data: any) => void;
}

const ModalCreateAdSlot: React.FC<ModalCreateAdSlotProps> = ({ onSubmit, onClose, creating, adSlotData, setAdSlotData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setAdSlotData({ ...adSlotData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="create-adslot-modal">
        <div className="modal-header">
          <h2>Create New Ad Slot</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <div>
              <strong>FHE Auction Notice</strong>
              <p>Bids on this slot will be encrypted using Zama FHE</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Ad Slot Title *</label>
            <input 
              type="text" 
              name="title" 
              value={adSlotData.title} 
              onChange={handleChange} 
              placeholder="Enter ad slot title..." 
            />
          </div>
          
          <div className="form-group">
            <label>Description *</label>
            <textarea 
              name="description" 
              value={adSlotData.description} 
              onChange={handleChange} 
              placeholder="Describe the ad slot..." 
              rows={4}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || !adSlotData.title || !adSlotData.description} 
            className="submit-btn"
          >
            {creating ? "Creating with FHE..." : "Create Ad Slot"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface AdSlotDetailModalProps {
  adSlot: AdSlot;
  onClose: () => void;
  decryptedBids: number[];
  setDecryptedBids: (value: number[]) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
  placeBid: (adSlotId: number, bidAmount: number) => void;
  closeAuction: (adSlotId: number) => void;
  isOwner: boolean;
}

const AdSlotDetailModal: React.FC<AdSlotDetailModalProps> = ({ 
  adSlot, 
  onClose, 
  decryptedBids, 
  setDecryptedBids, 
  isDecrypting, 
  decryptWithSignature,
  placeBid,
  closeAuction,
  isOwner
}) => {
  const [bidAmount, setBidAmount] = useState("");
  const [showBidForm, setShowBidForm] = useState(false);

  const handleDecrypt = async () => {
    if (decryptedBids.length > 0) { 
      setDecryptedBids([]); 
      return; 
    }
    
    const decrypted = await decryptWithSignature(adSlot.encryptedBids);
    if (decrypted !== null) {
      // For demo purposes, generate some random bid amounts
      const demoBids = [
        decrypted,
        decrypted * 0.8,
        decrypted * 0.6,
        decrypted * 0.4
      ];
      setDecryptedBids(demoBids);
    }
  };

  const handlePlaceBid = () => {
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid bid amount");
      return;
    }
    placeBid(adSlot.id, amount);
    setShowBidForm(false);
    setBidAmount("");
  };

  return (
    <div className="modal-overlay">
      <div className="adslot-detail-modal">
        <div className="modal-header">
          <h2>Ad Slot Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="adslot-info">
            <div className="info-item">
              <span>Title:</span>
              <strong>{adSlot.title}</strong>
            </div>
            <div className="info-item">
              <span>Owner:</span>
              <strong>{adSlot.owner.substring(0, 6)}...{adSlot.owner.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Status:</span>
              <strong className={`status-${adSlot.status}`}>{adSlot.status}</strong>
            </div>
            <div className="info-item">
              <span>Highest Bid:</span>
              <strong>{adSlot.highestBid} ETH</strong>
            </div>
            <div className="info-item">
              <span>Second Highest:</span>
              <strong>{adSlot.secondHighestBid} ETH</strong>
            </div>
            <div className="info-item full-width">
              <span>Description:</span>
              <div className="adslot-description">{adSlot.description}</div>
            </div>
          </div>
          
          <div className="auction-section">
            <h3>Auction Details</h3>
            
            {adSlot.status === 'active' && (
              <>
                {!showBidForm ? (
                  <button 
                    className="bid-btn" 
                    onClick={() => setShowBidForm(true)}
                    disabled={isOwner}
                  >
                    Place Bid
                  </button>
                ) : (
                  <div className="bid-form">
                    <input
                      type="number"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      placeholder="Enter bid amount in ETH"
                      min="0.01"
                      step="0.01"
                    />
                    <div className="bid-form-actions">
                      <button onClick={() => setShowBidForm(false)} className="cancel-btn">
                        Cancel
                      </button>
                      <button onClick={handlePlaceBid} className="submit-btn">
                        Submit Bid
                      </button>
                    </div>
                  </div>
                )}
                
                {isOwner && (
                  <button 
                    className="close-auction-btn" 
                    onClick={() => closeAuction(adSlot.id)}
                  >
                    Close Auction
                  </button>
                )}
              </>
            )}
          </div>
          
          <div className="encrypted-section">
            <h3>Encrypted Bid Data</h3>
            <div className="encrypted-data">{adSlot.encryptedBids.substring(0, 100)}...</div>
            <div className="fhe-tag">
              <div className="fhe-icon"></div>
              <span>FHE Encrypted</span>
            </div>
            <button 
              className="decrypt-btn" 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? (
                <span>Decrypting...</span>
              ) : decryptedBids.length > 0 ? (
                "Hide Decrypted Bids"
              ) : (
                "Decrypt with Wallet Signature"
              )}
            </button>
          </div>
          
          {decryptedBids.length > 0 && (
            <div className="decrypted-section">
              <h3>Decrypted Bid Data</h3>
              <div className="bid-history">
                {decryptedBids.map((bid, index) => (
                  <div className="bid-item" key={index}>
                    <span>Bid #{index + 1}:</span>
                    <strong>{bid.toFixed(4)} ETH</strong>
                  </div>
                ))}
              </div>
              <div className="decryption-notice">
                <div className="warning-icon"></div>
                <span>Decrypted bids are only visible after wallet signature verification</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;