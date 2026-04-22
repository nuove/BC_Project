// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title IdentityRegistry
/// @author Agnivesh Singh
/// @notice Decentralized identity registration, verification, and attribute management
/// @dev Identity data is stored off-chain (IPFS). Only hashes and CIDs live on-chain.
contract IdentityRegistry {

    // ─────────────────────────────────────────────────────────────────────────
    // Standard attribute name hashes
    // Use these constants when calling setAttribute / getAttribute
    // so all contracts and clients agree on the same keys.
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice keccak256("name") — legal full name
    bytes32 public constant ATTR_NAME     = keccak256("name");

    /// @notice keccak256("dob")  — date of birth (ISO-8601 string, e.g. "2001-07-14")
    bytes32 public constant ATTR_DOB      = keccak256("dob");

    /// @notice keccak256("srn")  — student/college registration number (SRN)
    bytes32 public constant ATTR_SRN      = keccak256("srn");

    /// @notice keccak256("prn")  — permanent registration number (PRN)
    bytes32 public constant ATTR_PRN      = keccak256("prn");

    /// @notice keccak256("email") — contact email address
    bytes32 public constant ATTR_EMAIL    = keccak256("email");

    /// @notice keccak256("phone") — phone number
    bytes32 public constant ATTR_PHONE    = keccak256("phone");

    /// @notice keccak256("govId") — government-issued ID number / Aadhaar / passport
    bytes32 public constant ATTR_GOV_ID   = keccak256("govId");

    /// @notice keccak256("photo") — IPFS CID of a profile photo
    bytes32 public constant ATTR_PHOTO    = keccak256("photo");

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    address public admin;

    /// @notice Minimum accumulated verifier weight needed to auto-verify an identity
    uint16 public requiredApprovals = 3;

    struct Identity {
        bytes32 identityHash;     // keccak256 of core identity payload (computed off-chain)
        string  ipfsCID;          // IPFS CID of the encrypted identity document
        address owner;
        uint256 createdAt;
        uint256 updatedAt;        // timestamp of last update (0 if never updated)
        bool    isVerified;
        bool    isActive;         // false = revoked / deactivated
        uint16  verificationLevel;
        uint16  approvalWeight;   // accumulated weight from verifiers
    }

    mapping(address => Identity)                                       public  identities;
    mapping(bytes32 => address)                                        public  hashToAddress;

    // verifier voting: user => verifier => has voted
    mapping(address => mapping(address => bool))                       public  hasVoted;

    mapping(address => bool)                                           public  trustedVerifiers;
    mapping(address => uint16)                                         public  verifierWeights;

    // attributeHashes[user][ATTR_*] => keccak256(value) or keccak256(IPFS CID)
    mapping(address => mapping(bytes32 => bytes32))                    public  attributeHashes;

    // attributeAccess[user][service][ATTR_*] => allowed?
    mapping(address => mapping(address => mapping(bytes32 => bool)))   public  attributeAccess;

    // authorised verifier manager contracts
    mapping(address => bool)                                           public  verifierManagers;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event IdentityRegistered    (address indexed user,      bytes32 indexed identityHash);
    event IdentityUpdated       (address indexed user,      bytes32 indexed newIdentityHash, string newIpfsCID);
    event IdentityRevoked       (address indexed user);
    event IdentityReactivated   (address indexed user);

    event VerifierAdded         (address indexed verifier,  uint16 weight);
    event VerifierRemoved       (address indexed verifier);
    event RequiredApprovalsUpdated (uint16 newRequired);

    event VerificationVoteCast  (address indexed user,      address indexed verifier, uint16 newWeight);
    event IdentityVerified      (address indexed user,      uint16 verificationLevel);

    event AttributeSet          (address indexed user,      bytes32 indexed nameHash, bytes32 valueHash, string ipfsCID);
    event AttributeAccessGranted(address indexed user,      address indexed service,  bytes32 indexed nameHash);
    event AttributeAccessRevoked(address indexed user,      address indexed service,  bytes32 indexed nameHash);

    event VerifierManagerAdded  (address indexed manager);
    event VerifierManagerRemoved(address indexed manager);

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyVerifier() {
        require(trustedVerifiers[msg.sender], "Only verifier");
        _;
    }

    modifier onlyVerifierManager() {
        require(verifierManagers[msg.sender], "Only verifier manager");
        _;
    }

    modifier onlyIdentityOwner(address _user) {
        require(identities[_user].owner == msg.sender, "Only identity owner");
        _;
    }

    modifier identityExists(address _user) {
        require(identities[_user].owner != address(0), "Identity not registered");
        _;
    }

    modifier identityActive(address _user) {
        require(identities[_user].isActive, "Identity is revoked");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor() {
        admin = msg.sender;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Identity Lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Register a new digital identity.
    /// @param _identityHash keccak256 of the identity payload (computed off-chain before upload)
    /// @param _ipfsCID      IPFS content identifier of the encrypted identity document
    function registerIdentity(bytes32 _identityHash, string calldata _ipfsCID) external {
        require(identities[msg.sender].owner == address(0), "Identity already exists");
        identities[msg.sender] = Identity({
            identityHash:      _identityHash,
            ipfsCID:           _ipfsCID,
            owner:             msg.sender,
            createdAt:         block.timestamp,
            updatedAt:         0,
            isVerified:        false,
            isActive:          true,
            verificationLevel: 0,
            approvalWeight:    0
        });
        hashToAddress[_identityHash] = msg.sender;
        emit IdentityRegistered(msg.sender, _identityHash);
    }

    /// @notice Update an existing identity's hash and IPFS document.
    ///         Resets verification status so the identity must be re-verified.
    /// @param _newIdentityHash New keccak256 of the updated identity payload
    /// @param _newIpfsCID      New IPFS CID pointing to the updated encrypted document
    function updateIdentity(bytes32 _newIdentityHash, string calldata _newIpfsCID)
        external
        identityExists(msg.sender)
        identityActive(msg.sender)
        onlyIdentityOwner(msg.sender)
    {
        Identity storage id = identities[msg.sender];

        // Remove old hash mapping
        delete hashToAddress[id.identityHash];

        id.identityHash      = _newIdentityHash;
        id.ipfsCID           = _newIpfsCID;
        id.updatedAt         = block.timestamp;
        id.isVerified        = false;    // must be re-verified after an update
        id.verificationLevel = 0;
        id.approvalWeight    = 0;

        hashToAddress[_newIdentityHash] = msg.sender;
        emit IdentityUpdated(msg.sender, _newIdentityHash, _newIpfsCID);
    }

    /// @notice Revoke (deactivate) the caller's own identity.
    ///         A revoked identity cannot be verified or have attributes read by services.
    function revokeIdentity()
        external
        identityExists(msg.sender)
        onlyIdentityOwner(msg.sender)
    {
        identities[msg.sender].isActive = false;
        emit IdentityRevoked(msg.sender);
    }

    /// @notice Admin can forcibly revoke any identity (e.g. fraud detection).
    function adminRevokeIdentity(address _user)
        external
        onlyAdmin
        identityExists(_user)
    {
        identities[_user].isActive = false;
        emit IdentityRevoked(_user);
    }

    /// @notice Reactivate a previously revoked identity (admin only).
    ///         The identity will still need to go through verification again.
    function reactivateIdentity(address _user)
        external
        onlyAdmin
        identityExists(_user)
    {
        require(!identities[_user].isActive, "Identity is already active");
        identities[_user].isActive       = false; // keep false until re-verified
        identities[_user].isVerified     = false;
        identities[_user].approvalWeight = 0;
        identities[_user].isActive       = true;
        emit IdentityReactivated(_user);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Verifier Management
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Add or update a trusted verifier with a voting weight.
    /// @param _verifier Address of the verifier account
    /// @param _weight   Voting weight (e.g. 1 = standard, 3 = institutional)
    function addTrustedVerifier(address _verifier, uint16 _weight) external onlyAdmin {
        require(_verifier != address(0), "Zero address");
        require(_weight > 0, "Weight must be > 0");
        trustedVerifiers[_verifier] = true;
        verifierWeights[_verifier]  = _weight;
        emit VerifierAdded(_verifier, _weight);
    }

    function removeTrustedVerifier(address _verifier) external onlyAdmin {
        require(trustedVerifiers[_verifier], "Not a verifier");
        trustedVerifiers[_verifier] = false;
        verifierWeights[_verifier]  = 0;
        emit VerifierRemoved(_verifier);
    }

    function setRequiredApprovals(uint16 _required) external onlyAdmin {
        require(_required > 0, "Must be > 0");
        requiredApprovals = _required;
        emit RequiredApprovalsUpdated(_required);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Verification Voting
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice A trusted verifier casts a weighted vote for a user's identity.
    ///         When accumulated weight reaches `requiredApprovals`, the identity
    ///         is automatically marked as verified at the supplied level.
    /// @param _user   Address of the user whose identity is being voted on
    /// @param _level  Verification level to assign upon consensus (e.g. 1=basic, 2=KYC, 3=full)
    function castVerificationVote(address _user, uint16 _level)
        external
        onlyVerifier
        identityExists(_user)
        identityActive(_user)
    {
        require(!hasVoted[_user][msg.sender],   "Already voted");
        require(!identities[_user].isVerified,  "Already verified");

        uint16 weight = verifierWeights[msg.sender];
        require(weight > 0, "Verifier has no weight");

        hasVoted[_user][msg.sender]          = true;
        identities[_user].approvalWeight    += weight;

        emit VerificationVoteCast(_user, msg.sender, identities[_user].approvalWeight);

        if (identities[_user].approvalWeight >= requiredApprovals) {
            identities[_user].isVerified        = true;
            identities[_user].verificationLevel = _level;
            emit IdentityVerified(_user, _level);
        }
    }

    /// @notice Called by an authorised verifier manager contract to directly verify an identity.
    ///         Useful for integrating off-chain oracles (e.g. biometric or document verification).
    function verifyFromManager(address _user, uint16 _level)
        external
        onlyVerifierManager
        identityExists(_user)
        identityActive(_user)
    {
        require(!identities[_user].isVerified, "Already verified");
        identities[_user].isVerified        = true;
        identities[_user].verificationLevel = _level;
        emit IdentityVerified(_user, _level);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Attribute Store (Selective Disclosure)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Store a hash of a personal attribute on-chain.
    ///         The raw (encrypted) attribute should live on IPFS; only its hash is stored here.
    /// @param _nameHash  Use the ATTR_* constants (e.g. ATTR_DOB, ATTR_SRN)
    /// @param _valueHash keccak256 of the attribute value or its IPFS CID
    /// @param _ipfsCID   IPFS CID of the encrypted attribute (emitted for off-chain indexing)
    function setAttribute(
        bytes32 _nameHash,
        bytes32 _valueHash,
        string calldata _ipfsCID
    )
        external
        identityExists(msg.sender)
        identityActive(msg.sender)
    {
        attributeHashes[msg.sender][_nameHash] = _valueHash;
        emit AttributeSet(msg.sender, _nameHash, _valueHash, _ipfsCID);
    }

    /// @notice Grant a service provider permission to read a specific attribute hash.
    function grantAttributeAccess(address _service, bytes32 _nameHash)
        external
        onlyIdentityOwner(msg.sender)
        identityActive(msg.sender)
    {
        attributeAccess[msg.sender][_service][_nameHash] = true;
        emit AttributeAccessGranted(msg.sender, _service, _nameHash);
    }

    /// @notice Revoke a service provider's permission for a specific attribute.
    function revokeAttributeAccess(address _service, bytes32 _nameHash)
        external
        onlyIdentityOwner(msg.sender)
    {
        attributeAccess[msg.sender][_service][_nameHash] = false;
        emit AttributeAccessRevoked(msg.sender, _service, _nameHash);
    }

    /// @notice Retrieve a user's attribute hash.
    ///         Caller must be the owner or a previously granted service address.
    function getAttribute(address _user, bytes32 _nameHash)
        external
        view
        identityExists(_user)
        returns (bytes32)
    {
        require(
            msg.sender == _user || attributeAccess[_user][msg.sender][_nameHash],
            "Access denied"
        );
        return attributeHashes[_user][_nameHash];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Read Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Fetch the full Identity record for a user.
    function getIdentity(address _user) external view returns (
        bytes32 identityHash,
        string memory ipfsCID,
        address owner,
        uint256 createdAt,
        uint256 updatedAt,
        bool    isVerified,
        bool    isActive,
        uint16  verificationLevel,
        uint16  approvalWeight
    ) {
        Identity storage id = identities[_user];
        return (
            id.identityHash,
            id.ipfsCID,
            id.owner,
            id.createdAt,
            id.updatedAt,
            id.isVerified,
            id.isActive,
            id.verificationLevel,
            id.approvalWeight
        );
    }

    /// @notice Quick check — is this address a registered, active, verified identity?
    function isVerifiedAndActive(address _user) external view returns (bool) {
        Identity storage id = identities[_user];
        return id.owner != address(0) && id.isActive && id.isVerified;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin — Verifier Manager Contracts
    // ─────────────────────────────────────────────────────────────────────────

    function addVerifierManager(address _manager) external onlyAdmin {
        require(_manager != address(0), "Zero address");
        verifierManagers[_manager] = true;
        emit VerifierManagerAdded(_manager);
    }

    function removeVerifierManager(address _manager) external onlyAdmin {
        require(verifierManagers[_manager], "Not a manager");
        verifierManagers[_manager] = false;
        emit VerifierManagerRemoved(_manager);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin — Role Transfer
    // ─────────────────────────────────────────────────────────────────────────

    function transferAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Zero address");
        admin = _newAdmin;
    }
}
