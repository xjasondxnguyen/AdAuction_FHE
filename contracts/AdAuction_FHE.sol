pragma solidity ^0.8.24;
import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AdAuctionFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public providers;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    struct Bid {
        euint32 encryptedBidAmount;
        euint32 encryptedAdQualityScore;
        address bidder;
    }

    struct AuctionBatch {
        uint256 batchId;
        bool isOpen;
        uint256 closeTimestamp;
        Bid[] bids;
    }

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    mapping(uint256 => AuctionBatch) public batches;
    mapping(uint256 => DecryptionContext) public decryptionContexts;
    uint256 public currentBatchId;
    uint256 public constant MAX_BIDS_PER_BATCH = 100;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event ContractPaused(address indexed account);
    event ContractUnpaused(address indexed account);
    event CooldownSecondsUpdated(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId, uint256 closeTimestamp);
    event BatchClosed(uint256 indexed batchId);
    event BidSubmitted(address indexed bidder, uint256 indexed batchId);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event AuctionSettled(uint256 indexed batchId, uint256 highestBidAmount, address highestBidder, uint256 secondHighestBidAmount);

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosed();
    error BatchFull();
    error InvalidBatch();
    error InvalidStateHash();
    error ReplayDetected();
    error InvalidProof();
    error NoBids();
    error NotEnoughBids();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor() {
        owner = msg.sender;
        providers[owner] = true;
        cooldownSeconds = 30;
        currentBatchId = 1;
        _openNewBatch(block.timestamp + 1 days);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
            emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        if (_paused) {
            paused = true;
            emit ContractPaused(msg.sender);
        } else {
            paused = false;
            emit ContractUnpaused(msg.sender);
        }
    }

    function setCooldownSeconds(uint256 _cooldownSeconds) external onlyOwner {
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = _cooldownSeconds;
        emit CooldownSecondsUpdated(oldCooldownSeconds, _cooldownSeconds);
    }

    function _openNewBatch(uint256 _closeTimestamp) private {
        uint256 batchId = currentBatchId++;
        batches[batchId] = AuctionBatch({
            batchId: batchId,
            isOpen: true,
            closeTimestamp: _closeTimestamp,
            bids: new Bid[](0)
        });
        emit BatchOpened(batchId, _closeTimestamp);
    }

    function openBatch(uint256 _closeTimestamp) external onlyOwner whenNotPaused {
        _openNewBatch(_closeTimestamp);
    }

    function closeBatch(uint256 batchId) external onlyOwner whenNotPaused {
        if (batchId >= currentBatchId || !batches[batchId].isOpen) revert InvalidBatch();
        batches[batchId].isOpen = false;
        emit BatchClosed(batchId);
    }

    function submitBid(
        uint256 batchId,
        euint32 encryptedBidAmount,
        euint32 encryptedAdQualityScore
    ) external onlyProvider whenNotPaused {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) revert CooldownActive();
        if (batchId >= currentBatchId || !batches[batchId].isOpen) revert BatchClosed();
        if (batches[batchId].bids.length >= MAX_BIDS_PER_BATCH) revert BatchFull();

        lastSubmissionTime[msg.sender] = block.timestamp;
        batches[batchId].bids.push(Bid({
            encryptedBidAmount: encryptedBidAmount,
            encryptedAdQualityScore: encryptedAdQualityScore,
            bidder: msg.sender
        }));
        emit BidSubmitted(msg.sender, batchId);
    }

    function requestAuctionSettlement(uint256 batchId) external onlyOwner whenNotPaused {
        if (batchId >= currentBatchId || batches[batchId].isOpen) revert InvalidBatch();
        if (batches[batchId].bids.length == 0) revert NoBids();
        if (batches[batchId].bids.length < 2) revert NotEnoughBids();
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) revert CooldownActive();

        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        euint32 encryptedHighestBidAmount;
        euint32 encryptedSecondHighestBidAmount;
        address highestBidder;
        address secondHighestBidder;

        encryptedHighestBidAmount = batches[batchId].bids[0].encryptedBidAmount;
        highestBidder = batches[batchId].bids[0].bidder;
        encryptedSecondHighestBidAmount = batches[batchId].bids[1].encryptedBidAmount;
        secondHighestBidder = batches[batchId].bids[1].bidder;

        for (uint i = 2; i < batches[batchId].bids.length; i++) {
            ebool isCurrentHigher = encryptedHighestBidAmount.ge(batches[batchId].bids[i].encryptedBidAmount);
            euint32 newHighest = encryptedHighestBidAmount.select(batches[batchId].bids[i].encryptedBidAmount, isCurrentHigher);
            euint32 newSecondHighest = encryptedSecondHighestBidAmount.select(encryptedHighestBidAmount, isCurrentHigher);
            address newHighestBidder = isCurrentHigher.cleartext() ? highestBidder : batches[batchId].bids[i].bidder;
            address newSecondHighestBidder = isCurrentHigher.cleartext() ? highestBidder : secondHighestBidder;

            encryptedHighestBidAmount = newHighest;
            encryptedSecondHighestBidAmount = newSecondHighest;
            highestBidder = newHighestBidder;
            secondHighestBidder = newSecondHighestBidder;
        }

        bytes32[] memory cts = new bytes32[](2);
        cts[0] = encryptedHighestBidAmount.toBytes32();
        cts[1] = encryptedSecondHighestBidAmount.toBytes32();

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });
        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayDetected();
        uint256 batchId = decryptionContexts[requestId].batchId;

        bytes32[] memory cts = new bytes32[](2);
        cts[0] = batches[batchId].bids[0].encryptedBidAmount.toBytes32();
        cts[1] = batches[batchId].bids[1].encryptedBidAmount.toBytes32();

        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != decryptionContexts[requestId].stateHash) revert InvalidStateHash();

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint256 highestBidAmount = abi.decode(cleartexts[0:32], (uint32));
        uint256 secondHighestBidAmount = abi.decode(cleartexts[32:64], (uint32));

        decryptionContexts[requestId].processed = true;
        emit AuctionSettled(batchId, highestBidAmount, batches[batchId].bids[0].bidder, secondHighestBidAmount);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 cipher) internal view {
        if (!FHE.isInitialized(cipher)) revert("FHE: Cipher not initialized");
    }

    function _requireInitialized(euint32 cipher) internal view {
        if (!FHE.isInitialized(cipher)) revert("FHE: Cipher not initialized");
    }
}