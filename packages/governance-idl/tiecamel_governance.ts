/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/tiecamel_governance.json`.
 */
export type TiecamelGovernance = {
  "address": "4G9rXL6BLXEKWM9QT6YWSBpXaTFBGmYbLB77P3vpZtxD",
  "metadata": {
    "name": "tiecamelGovernance",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Non-custodial critical-obligation governance and reporting commitments"
  },
  "instructions": [
    {
      "name": "amendBoard",
      "docs": [
        "Roster replacement/key recovery uses the CURRENT roster's quorum, never a service key."
      ],
      "discriminator": [
        44,
        194,
        61,
        127,
        246,
        118,
        4,
        219
      ],
      "accounts": [
        {
          "name": "board",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "board.chain_id",
                "account": "board"
              }
            ]
          }
        },
        {
          "name": "proposer",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "expectedPolicyVersion",
          "type": "u64"
        },
        {
          "name": "expectedParent",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "members",
          "type": {
            "vec": {
              "defined": {
                "name": "member"
              }
            }
          }
        },
        {
          "name": "threshold",
          "type": "u8"
        },
        {
          "name": "service",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "appendReportingCheckpoint",
      "discriminator": [
        173,
        110,
        22,
        26,
        11,
        22,
        161,
        215
      ],
      "accounts": [
        {
          "name": "board",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "board.chain_id",
                "account": "board"
              }
            ]
          }
        },
        {
          "name": "proposer",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "expectedPolicyVersion",
          "type": "u64"
        },
        {
          "name": "expectedParent",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "commitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "approveResolution",
      "discriminator": [
        239,
        215,
        26,
        98,
        160,
        130,
        11,
        221
      ],
      "accounts": [
        {
          "name": "board",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "board.chain_id",
                "account": "board"
              }
            ]
          },
          "relations": [
            "case"
          ]
        },
        {
          "name": "case",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "board"
              },
              {
                "kind": "account",
                "path": "case.case_id",
                "account": "criticalCase"
              }
            ]
          }
        },
        {
          "name": "actor",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "expectedRevision",
          "type": "u64"
        },
        {
          "name": "expectedParent",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "evidenceCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "policyVersion",
          "type": "u64"
        }
      ]
    },
    {
      "name": "finalizeResolution",
      "discriminator": [
        191,
        74,
        94,
        214,
        45,
        150,
        152,
        125
      ],
      "accounts": [
        {
          "name": "board",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "board.chain_id",
                "account": "board"
              }
            ]
          },
          "relations": [
            "case"
          ]
        },
        {
          "name": "case",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "board"
              },
              {
                "kind": "account",
                "path": "case.case_id",
                "account": "criticalCase"
              }
            ]
          }
        },
        {
          "name": "actor",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "expectedRevision",
          "type": "u64"
        },
        {
          "name": "expectedParent",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "evidenceCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "initializeBoard",
      "discriminator": [
        146,
        47,
        165,
        250,
        246,
        28,
        104,
        227
      ],
      "accounts": [
        {
          "name": "board",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "chainId"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "chainId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "members",
          "type": {
            "vec": {
              "defined": {
                "name": "member"
              }
            }
          }
        },
        {
          "name": "threshold",
          "type": "u8"
        },
        {
          "name": "service",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "proposeResolution",
      "discriminator": [
        19,
        68,
        181,
        23,
        194,
        146,
        152,
        252
      ],
      "accounts": [
        {
          "name": "board",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "board.chain_id",
                "account": "board"
              }
            ]
          },
          "relations": [
            "case"
          ]
        },
        {
          "name": "case",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "board"
              },
              {
                "kind": "account",
                "path": "case.case_id",
                "account": "criticalCase"
              }
            ]
          }
        },
        {
          "name": "actor",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "expectedRevision",
          "type": "u64"
        },
        {
          "name": "expectedParent",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "evidenceCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "reassignCase",
      "discriminator": [
        6,
        125,
        100,
        139,
        231,
        104,
        129,
        23
      ],
      "accounts": [
        {
          "name": "board",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "board.chain_id",
                "account": "board"
              }
            ]
          },
          "relations": [
            "case"
          ]
        },
        {
          "name": "case",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "board"
              },
              {
                "kind": "account",
                "path": "case.case_id",
                "account": "criticalCase"
              }
            ]
          }
        },
        {
          "name": "actor",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "expectedRevision",
          "type": "u64"
        },
        {
          "name": "expectedParent",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "ownerIdentity",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "registerCase",
      "discriminator": [
        163,
        145,
        117,
        84,
        100,
        61,
        1,
        229
      ],
      "accounts": [
        {
          "name": "board",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  97,
                  114,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "board.chain_id",
                "account": "board"
              }
            ]
          }
        },
        {
          "name": "case",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "board"
              },
              {
                "kind": "arg",
                "path": "caseId"
              }
            ]
          }
        },
        {
          "name": "actor",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "caseId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "ownerIdentity",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "expectedParent",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "noticeCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "board",
      "discriminator": [
        79,
        48,
        160,
        63,
        153,
        132,
        240,
        56
      ]
    },
    {
      "name": "criticalCase",
      "discriminator": [
        96,
        208,
        142,
        215,
        82,
        176,
        77,
        131
      ]
    }
  ],
  "events": [
    {
      "name": "governanceCheckpoint",
      "discriminator": [
        234,
        105,
        172,
        80,
        94,
        70,
        207,
        28
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidRoster",
      "msg": "The roster must contain 3–12 valid, non-service identities"
    },
    {
      "code": 6001,
      "name": "weakPolicy",
      "msg": "Critical controls cannot be reduced below two independent approvals"
    },
    {
      "code": 6002,
      "name": "directorRequired",
      "msg": "A director must participate"
    },
    {
      "code": 6003,
      "name": "duplicatePerson",
      "msg": "One person or key cannot occupy two roster positions"
    },
    {
      "code": 6004,
      "name": "quorumRequired",
      "msg": "Current roster quorum is required"
    },
    {
      "code": 6005,
      "name": "unauthorized",
      "msg": "The signer is not an adopted reviewer or permitted service"
    },
    {
      "code": 6006,
      "name": "unknownOwner",
      "msg": "Owner identity must be on the adopted roster"
    },
    {
      "code": 6007,
      "name": "selfApproval",
      "msg": "Owner and evidence submitter cannot approve closure"
    },
    {
      "code": 6008,
      "name": "duplicateApproval",
      "msg": "This person has already approved"
    },
    {
      "code": 6009,
      "name": "stalePolicy",
      "msg": "The policy changed; resubmit and review evidence again"
    },
    {
      "code": 6010,
      "name": "staleEvidence",
      "msg": "The evidence does not match this approval"
    },
    {
      "code": 6011,
      "name": "staleParent",
      "msg": "The record head changed; refresh before signing"
    },
    {
      "code": 6012,
      "name": "staleRevision",
      "msg": "The case revision changed; refresh before signing"
    },
    {
      "code": 6013,
      "name": "notInReview",
      "msg": "Closure evidence must be under review"
    },
    {
      "code": 6014,
      "name": "alreadyResolved",
      "msg": "Resolved cases cannot be rewritten"
    },
    {
      "code": 6015,
      "name": "emptyCommitment",
      "msg": "Commitments cannot be empty"
    },
    {
      "code": 6016,
      "name": "overflow",
      "msg": "Monotonic counter overflow"
    }
  ],
  "types": [
    {
      "name": "approval",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "key",
            "type": "pubkey"
          },
          {
            "name": "identity",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "evidenceRevision",
            "type": "u64"
          },
          {
            "name": "policyVersion",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "board",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "chainId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "members",
            "type": {
              "vec": {
                "defined": {
                  "name": "member"
                }
              }
            }
          },
          {
            "name": "threshold",
            "type": "u8"
          },
          {
            "name": "service",
            "type": "pubkey"
          },
          {
            "name": "policyVersion",
            "type": "u64"
          },
          {
            "name": "sequence",
            "type": "u64"
          },
          {
            "name": "head",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "criticalCase",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "board",
            "type": "pubkey"
          },
          {
            "name": "caseId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "ownerIdentity",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "submitterIdentity",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "noticeCommitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "evidenceCommitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "revision",
            "type": "u64"
          },
          {
            "name": "evidenceRevision",
            "type": "u64"
          },
          {
            "name": "policyVersion",
            "type": "u64"
          },
          {
            "name": "phase",
            "type": {
              "defined": {
                "name": "phase"
              }
            }
          },
          {
            "name": "approvals",
            "type": {
              "vec": {
                "defined": {
                  "name": "approval"
                }
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "governanceCheckpoint",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "board",
            "type": "pubkey"
          },
          {
            "name": "case",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "sequence",
            "type": "u64"
          },
          {
            "name": "parent",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "head",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "policyVersion",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "member",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "key",
            "type": "pubkey"
          },
          {
            "name": "identity",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "director",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "phase",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "review"
          },
          {
            "name": "resolved"
          }
        ]
      }
    }
  ]
};
