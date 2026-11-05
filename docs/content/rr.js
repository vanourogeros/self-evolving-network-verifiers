window.HSA_CONTENT = window.HSA_CONTENT || {}; window.HSA_CONTENT.rr = {
 "title": "Route reflection",
 "oracleName": "Batfish",
 "intro": "BGP is how networks exchange routes. In a large network, routers don't all exchange routes directly: a route reflector passes routes on to the routers it serves, its clients. The reference here is Batfish, a widely used tool that works out, from configuration files, which routes a network will choose.",
 "layout": {
  "case_12": {
   "r1": [
    300,
    70
   ],
   "r0": [
    170,
    230
   ],
   "r2": [
    430,
    230
   ],
   "e0": [
    540,
    310
   ]
  },
  "crit_04": {
   "rA": [
    115,
    110
   ],
   "M": [
    165,
    185
   ],
   "T": [
    225,
    255
   ],
   "rO": [
    300,
    310
   ],
   "N": [
    390,
    235
   ],
   "rB": [
    455,
    145
   ],
   "eA": [
    70,
    45
   ],
   "eB": [
    510,
    60
   ]
  },
  "case_03": {
   "r0": [
    300,
    70
   ],
   "r1": [
    170,
    240
   ],
   "r2": [
    430,
    240
   ],
   "e0": [
    70,
    310
   ]
  },
  "case_07": {
   "r0": [
    170,
    60
   ],
   "r1": [
    430,
    60
   ],
   "r3": [
    300,
    150
   ],
   "r2": [
    300,
    240
   ],
   "e0": [
    300,
    320
   ]
  },
  "crit_03": {
   "rT": [
    300,
    50
   ],
   "rM": [
    120,
    270
   ],
   "rO": [
    300,
    190
   ],
   "rB": [
    480,
    270
   ],
   "e0": [
    550,
    320
   ]
  }
 },
 "versions": [
  {
   "name": "Start",
   "blurb": "Before the AI's work: the verifier has a basic pass-along rule, but it forgets which routes came from a client, and it does not count reflections.",
   "rules": [
    {
     "id": 1,
     "text": "Each router keeps the one best route it hears, if it can reach that route's entry router.",
     "change": "same"
    },
    {
     "id": 2,
     "text": "Every route counts as coming from a regular peer, even one sent by a client.",
     "change": "same",
     "wrong": "The verifier treats a route from a client like one from a regular peer, while it should actually remember it came from a client."
    },
    {
     "id": 3,
     "text": "Routes from clients or outside go to everyone; routes from regular peers go only to clients and outside.",
     "change": "same"
    },
    {
     "id": 4,
     "text": "Tie-break: cheaper path to the entry router, then lower neighbor number.",
     "change": "same",
     "wrong": "The verifier breaks ties without counting reflections, while it should actually prefer the route reflected fewer times, right after path cost."
    },
    {
     "id": 5,
     "text": "The entry router is where the route came in from outside; traffic heads there.",
     "change": "same"
    }
   ],
   "reveal": {
    "round": 1,
    "proposals": 0,
    "excerpt": "-        transformed_route.from_type = SymbolicSessionType::from_val(ctx, &s.reverse_ty());\n+        // Record how the RECEIVER (`to`) learned this route: its own configured view\n+        // of the session with `from` (sessions[to][from]). This preserves the\n+        // IBgpClient relationship when `from` is `to`'s client, so a route learned\n+        // from a client is later reflected to all iBGP neighbors, not just clients\n+        // (RFC 4456). `s.reverse_ty()` collapsed every iBGP session to IBgpPeer,\n+        // which wrongly suppressed client→non-client-peer reflection.\n+        let recv_ty = self\n+            .sessions\n+            .get(&to)\n+            .and_then(|x| x.get(&from))\n…\n+        transformed_route.from_type = SymbolicSessionType::from_val(ctx, &recv_ty);",
    "explain": "The seed had a rule for route reflection, but it recorded every route learned over iBGP as coming from an ordinary peer. A reflector passes routes to non-client peers only if they came from a client or from eBGP, so a client's route never reached its non-client peers. The agent made the model remember the receiver's view of the session, and also added cluster-list length and an originator tie-break. The starting test corpus already caught this; no Test Generator needed."
   },
   "missing": "The verifier does not count how many times a route was reflected, while it should actually keep that count for every route."
  },
  {
   "name": "Midway",
   "blurb": "Midway through the run: it remembers clients now, and breaks ties in the textbook order.",
   "rules": [
    {
     "id": 1,
     "text": "Each router keeps the one best route it hears, if it can reach that route's entry router.",
     "change": "same"
    },
    {
     "id": 2,
     "text": "A route remembers whether it came from a client or a regular peer.",
     "change": "changed"
    },
    {
     "id": 3,
     "text": "Routes from clients or outside go to everyone; routes from regular peers go only to clients and outside.",
     "change": "same"
    },
    {
     "id": 4,
     "text": "Tie-break: cheaper path, then lower entry-router number, then fewer reflections, then lower neighbor number.",
     "change": "changed",
     "wrong": "The verifier compares entry-router numbers before reflections, while it should actually compare reflections first, right after path cost."
    },
    {
     "id": 5,
     "text": "The entry router is where the route came in from outside; traffic heads there.",
     "change": "same"
    },
    {
     "id": 6,
     "text": "Each time a reflector passes a route on, it counts one more reflection.",
     "change": "new"
    }
   ],
   "reveal": {
    "round": 2,
    "proposals": 3,
    "excerpt": "+        // compare the CLUSTER_LIST length (shorter preferred). The oracle ranks\n+        // CLUSTER_LIST length ABOVE the originator/next-hop step (established by the\n+        // differential witness of crit_04: two copies tying on weight/LP/AS-path/IGP\n+        // whose cluster length and originator point OPPOSITE ways are resolved by the\n+        // oracle on the shorter cluster list, not the lower originator). So the copy\n+        // that traversed fewer reflection hops wins here, before next_hop.\n…\n-                &s_nh_id.lt(o_nh_id),\n+                &s_cl.lt(o_cl),\n…\n+        // originator — the proxy for ORIGINATOR_ID. Ranked below CLUSTER_LIST length\n…\n+                &s_cl.equals(o_cl),\n+                &s_nh_id.lt(o_nh_id),",
    "explain": "Two reflected copies of a route can tie on every attribute up to the IGP cost. The agent had implemented RFC 4456's order, which compares the originator ID before the cluster-list length, but Batfish ranks cluster-list length first, so on this network the oracle (Batfish) keeps the copy with the shorter cluster list. The agent moved the cluster-length step ahead of the originator step."
   }
  },
  {
   "name": "Final",
   "blurb": "End of the run: it breaks ties the way Batfish does.",
   "rules": [
    {
     "id": 1,
     "text": "Each router keeps the one best route it hears, if it can reach that route's entry router.",
     "change": "same"
    },
    {
     "id": 2,
     "text": "A route remembers whether it came from a client or a regular peer.",
     "change": "same"
    },
    {
     "id": 3,
     "text": "Routes from clients or outside go to everyone; routes from regular peers go only to clients and outside.",
     "change": "same"
    },
    {
     "id": 4,
     "text": "Tie-break: cheaper path, then fewer reflections, then lower entry-router number, then lower neighbor number.",
     "change": "changed"
    },
    {
     "id": 5,
     "text": "The entry router is where the route came in from outside; traffic heads there.",
     "change": "same"
    },
    {
     "id": 6,
     "text": "Each time a reflector passes a route on, it counts one more reflection.",
     "change": "same"
    }
   ],
   "reveal": null
  }
 ],
 "twist": "Comparing reflections before the entry router is Batfish's choice. Real routers running FRR (common open-source router software, version 8.4) compare the entry router first by default, as the Midway version did. So the final verifier is only as faithful as its reference, and no more.",
 "bonus": null,
 "endText": "The Final version agrees with Batfish on every network here and on all 600 tests of the run. But passing every test is not a proof that it is right. When can we trust it? Come and argue with us at the poster.",
 "deciders": {
  "case_12": {
   "no failures": [
    {
     "verifier": {
      "rule": 2,
      "because": "r0 records client r2's route as from a non-client, so never sends it to r1 → no route"
     },
     "oracle": {
      "because": "r0 learned it from client r2; the oracle (Batfish) reflects it to every peer, including r1 → r0"
     }
    },
    {
     "verifier": {
      "rule": 3,
      "because": "r0 learned the route from its client r2, so it sends it to every neighbor, including r1 → r0"
     },
     "oracle": {
      "because": "r0 learned it from client r2; the oracle (Batfish) reflects it to every peer, including r1 → r0"
     }
    },
    {
     "verifier": {
      "rule": 3,
      "because": "r0 learned the route from its client r2, so it sends it to every neighbor, including r1 → r0"
     },
     "oracle": {
      "because": "r0 learned it from client r2; the oracle (Batfish) reflects it to every peer, including r1 → r0"
     }
    }
   ]
  },
  "crit_04": {
   "no failures": [
    {
     "verifier": {
      "rule": 4,
      "because": "copies tie up to IGP cost (3 = 3); lower neighbor ID wins: T (2) < N (5) → T"
     },
     "oracle": {
      "because": "tie at IGP cost 3; the oracle (Batfish) compares cluster-list length first: N's 1 < T's 2 → N"
     }
    },
    {
     "verifier": {
      "rule": 4,
      "because": "copies tie up to IGP cost (3 = 3); originator comes first: rA (0) < rB (4) → T"
     },
     "oracle": {
      "because": "tie at IGP cost 3; the oracle (Batfish) compares cluster-list length first: N's 1 < T's 2 → N"
     }
    },
    {
     "verifier": {
      "rule": 4,
      "because": "copies tie up to IGP cost (3 = 3); cluster list comes first: N's 1 < T's 2 → N"
     },
     "oracle": {
      "because": "tie at IGP cost 3; the oracle (Batfish) compares cluster-list length first: N's 1 < T's 2 → N"
     }
    }
   ],
   "fail (3, 5)": [
    {
     "verifier": {
      "rule": 1,
      "because": "with rO–N down, rO cannot reach next hop rB, so only T's copy counts → T"
     },
     "oracle": {
      "because": "rO–N down cuts rO off from N and rB; the oracle (Batfish) has only T's copy → T"
     }
    },
    {
     "verifier": {
      "rule": 1,
      "because": "with rO–N down, rO cannot reach next hop rB, so only T's copy counts → T"
     },
     "oracle": {
      "because": "rO–N down cuts rO off from N and rB; the oracle (Batfish) has only T's copy → T"
     }
    },
    {
     "verifier": {
      "rule": 1,
      "because": "with rO–N down, rO cannot reach next hop rB, so only T's copy counts → T"
     },
     "oracle": {
      "because": "rO–N down cuts rO off from N and rB; the oracle (Batfish) has only T's copy → T"
     }
    }
   ]
  },
  "case_03": {
   "no failures": [
    {
     "verifier": {
      "rule": 3,
      "because": "r0 records r1's route as from a non-client, but non-client routes still go to clients like r2 → r0"
     },
     "oracle": {
      "because": "the oracle (Batfish) has r0 reflect client r1's route to its other client r2 → r0"
     }
    },
    {
     "verifier": {
      "rule": 3,
      "because": "r0 learned the route from its client r1, so it sends it to every neighbor, including r2 → r0"
     },
     "oracle": {
      "because": "the oracle (Batfish) has r0 reflect client r1's route to its other client r2 → r0"
     }
    },
    {
     "verifier": {
      "rule": 3,
      "because": "r0 learned the route from its client r1, so it sends it to every neighbor, including r2 → r0"
     },
     "oracle": {
      "because": "the oracle (Batfish) has r0 reflect client r1's route to its other client r2 → r0"
     }
    }
   ],
   "fail (0, 1)": [
    {
     "verifier": {
      "rule": 3,
      "because": "r1 stays reachable via r2; r0's copy, though marked non-client, still goes to client r2 → r0"
     },
     "oracle": {
      "because": "r1 stays reachable via r2, so the oracle (Batfish) still has r0 reflect r1's route to r2 → r0"
     }
    },
    {
     "verifier": {
      "rule": 3,
      "because": "r1 stays reachable via r2; r0 learned from client r1, so it still sends to r2 → r0"
     },
     "oracle": {
      "because": "r1 stays reachable via r2, so the oracle (Batfish) still has r0 reflect r1's route to r2 → r0"
     }
    },
    {
     "verifier": {
      "rule": 3,
      "because": "r1 stays reachable via r2; r0 learned from client r1, so it still sends to r2 → r0"
     },
     "oracle": {
      "because": "r1 stays reachable via r2, so the oracle (Batfish) still has r0 reflect r1's route to r2 → r0"
     }
    }
   ]
  },
  "case_07": {
   "no failures": [
    {
     "verifier": {
      "rule": 4,
      "because": "copies tie up to IGP cost (1 = 1); lower neighbor ID wins: r0 (0) < r1 (1) → r0"
     },
     "oracle": {
      "because": "both copies tie through cluster-list length and originator r2; the oracle (Batfish) keeps r0's copy → r0"
     }
    },
    {
     "verifier": {
      "rule": 4,
      "because": "copies tie on IGP cost (1), originator r2 and cluster list (1); lower neighbor r0 < r1 → r0"
     },
     "oracle": {
      "because": "both copies tie through cluster-list length and originator r2; the oracle (Batfish) keeps r0's copy → r0"
     }
    },
    {
     "verifier": {
      "rule": 4,
      "because": "copies tie on IGP cost (1), cluster list (1) and originator r2; lower neighbor r0 < r1 → r0"
     },
     "oracle": {
      "because": "both copies tie through cluster-list length and originator r2; the oracle (Batfish) keeps r0's copy → r0"
     }
    }
   ],
   "fail (0, 1)": [
    {
     "verifier": {
      "rule": 4,
      "because": "r0–r1 is on neither copy's path; same tie, lower neighbor ID r0 (0) < r1 (1) → r0"
     },
     "oracle": {
      "because": "r0–r1 is on neither copy's path; same tie, the oracle (Batfish) keeps r0's copy → r0"
     }
    },
    {
     "verifier": {
      "rule": 4,
      "because": "r0–r1 is on neither copy's path; same tie, lower neighbor ID r0 (0) < r1 (1) → r0"
     },
     "oracle": {
      "because": "r0–r1 is on neither copy's path; same tie, the oracle (Batfish) keeps r0's copy → r0"
     }
    },
    {
     "verifier": {
      "rule": 4,
      "because": "r0–r1 is on neither copy's path; same tie, lower neighbor ID r0 (0) < r1 (1) → r0"
     },
     "oracle": {
      "because": "r0–r1 is on neither copy's path; same tie, the oracle (Batfish) keeps r0's copy → r0"
     }
    }
   ]
  },
  "crit_03": {
   "no failures": [
    {
     "verifier": {
      "rule": 4,
      "because": "both copies have next hop rB, IGP cost 1; lower neighbor ID wins: rM (1) < rT (2) → rM"
     },
     "oracle": {
      "because": "same originator rB and IGP cost; the oracle (Batfish) prefers the shorter cluster list, rT's 1 < rM's 2 → rT"
     }
    },
    {
     "verifier": {
      "rule": 4,
      "because": "same originator rB and IGP cost (1); shorter cluster list wins: rT's 1 < rM's 2 → rT"
     },
     "oracle": {
      "because": "same originator rB and IGP cost; the oracle (Batfish) prefers the shorter cluster list, rT's 1 < rM's 2 → rT"
     }
    },
    {
     "verifier": {
      "rule": 4,
      "because": "copies tie on IGP cost (1); shorter cluster list wins: rT's 1 < rM's 2 → rT"
     },
     "oracle": {
      "because": "same originator rB and IGP cost; the oracle (Batfish) prefers the shorter cluster list, rT's 1 < rM's 2 → rT"
     }
    }
   ]
  }
 },
 "mistakes": {
  "case_12": {
   "no failures": {
    "0": {
     "rule": 2,
     "why": "r0 got the route from its client r2 but treats it as coming from a regular peer, so it does not pass it on to r1.",
     "reference": "knows r2 is r0's client, so r0 passes the route on to r1."
    }
   }
  },
  "crit_04": {
   "no failures": {
    "0": {
     "rule": 4,
     "tags": {
      "T": "reflected 2×",
      "N": "reflected 1×"
     },
     "why": "The paths to each copy's entry router both cost 3, so it falls back to the neighbor number: T (2) is lower than N (5).",
     "reference": "next prefers the route reflected fewer times: N's (once) beats T's (twice).",
     "missing": true
    },
    "1": {
     "rule": 4,
     "tags": {
      "T": "reflected 2×",
      "N": "reflected 1×"
     },
     "why": "Both paths cost 3, so it compares entry routers next: rA (0) is lower than rB (4), so it takes T's route.",
     "reference": "compares reflections before entry routers: N's route (reflected once) beats T's (twice)."
    }
   }
  },
  "crit_03": {
   "no failures": {
    "0": {
     "rule": 4,
     "tags": {
      "rT": "reflected 1×",
      "rM": "reflected 2×"
     },
     "why": "Both paths cost 1, so it falls back to the neighbor number: rM (1) is lower than rT (2).",
     "reference": "next prefers the route reflected fewer times: rT's (once) beats rM's (twice).",
     "missing": true
    }
   }
  }
 },
 "cards": {
  "case_12": {
   "title": "Passing a client's route upward",
   "blurb": "r2 is r0's client, and r0 is r1's client. The route comes in at r2."
  },
  "crit_04": {
   "title": "Two routes, same cost",
   "blurb": "rO hears the route twice at equal cost: via T (reflected twice) and via N (reflected once)."
  },
  "case_03": {
   "title": "Two clients, one reflector",
   "blurb": "Reflector r0 serves clients r1 and r2. The route comes in at r1."
  },
  "case_07": {
   "title": "Two reflectors",
   "blurb": "Reflectors r0 and r1 both serve r2 and r3. The route comes in at r2."
  },
  "crit_03": {
   "title": "A chain of reflectors",
   "blurb": "rO hears the route via rT (reflected once) and via rM (reflected twice)."
  }
 },
 "rulesNote": "Simplified: rule 4 leaves out tie-break steps (weight, preference, path length) that never decide anything on these networks.",
 "realName": "Batfish",
 "howto": [
  [
   "Route",
   "a way to reach a destination outside this network. It comes in at one router, the entry router, and is passed on from router to router."
  ],
  [
   "Cables and sessions",
   "grey lines are cables, with their cost. Routes are passed only over sessions, in either direction: blue arrows point from a route reflector to its client; dashed lines join regular peers."
  ],
  [
   "#n",
   "each router's number. Some ties go to the lower number: of the entry router, or of the neighbor that sent the route."
  ],
  [
   "Gold and pink arrows",
   "how the route reaches the router in the question (dashed ring), according to Batfish (gold) and to the verifier (pink)."
  ]
 ],
 "verifierSays": {
  "default": [
   "Clients or regular peers, a route is a route to me. And I never count reflections.",
   "On a tie, I compare entry-router numbers first, and only then the number of reflections.",
   "I now agree with Batfish on every test. But does that make me right?"
  ],
  "case_12": {
   "0": "A route from a client? I treat it just like one from a regular peer."
  },
  "crit_04": {
   "0": "Reflections? I don’t count them. On a tie, the lower neighbor number wins."
  },
  "crit_03": {
   "0": "Reflections? I don’t count them. On a tie, the lower neighbor number wins."
  }
 },
 "verifierLearns": {
  "case_12": {
   "0": "Oh, so a reflector must remember a route came from its client, and pass it to all other neighbors!"
  },
  "crit_04": {
   "0": "Oh, so when path costs tie, the route reflected fewer times wins!",
   "1": "Oh, so I must compare reflections before entry-router numbers!"
  },
  "crit_03": {
   "0": "Oh, so when path costs tie, the route reflected fewer times wins!"
  }
 }
};
