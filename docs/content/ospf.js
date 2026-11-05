window.HSA_CONTENT = window.HSA_CONTENT || {}; window.HSA_CONTENT.ospf = {
 "title": "OSPF areas",
 "oracleName": "bgpsim",
 "intro": "OSPF is how routers find paths inside one network. It splits the network into areas; traffic between areas must pass through the central one, area 0. The reference here is bgpsim, a network simulator that follows OSPF.",
 "layout": {
  "area_forced_backbone": {
   "r0": [
    70,
    150
   ],
   "r1": [
    220,
    150
   ],
   "r2": [
    380,
    150
   ],
   "r3": [
    530,
    150
   ],
   "r4": [
    300,
    280
   ],
   "e0": [
    530,
    55
   ]
  },
  "octr_08_backbone_partitioned_dest": {
   "s": [
    135,
    100
   ],
   "b1": [
    265,
    100
   ],
   "b2": [
    265,
    270
   ],
   "t": [
    465,
    270
   ],
   "x": [
    465,
    100
   ],
   "e0": [
    420,
    290
   ]
  },
  "octr_03_discontiguous_area": {
   "r0": [
    200,
    100
   ],
   "r1": [
    200,
    270
   ],
   "r2": [
    400,
    270
   ],
   "r3": [
    400,
    100
   ],
   "e0": [
    500,
    290
   ]
  },
  "square": {
   "r0": [
    200,
    90
   ],
   "r1": [
    400,
    90
   ],
   "r2": [
    400,
    270
   ],
   "r3": [
    200,
    270
   ],
   "e0": [
    70,
    90
   ],
   "e1": [
    530,
    270
   ]
  },
  "octr_04_intra_beats_cheaper_backbone": {
   "r0": [
    130,
    100
   ],
   "r4": [
    300,
    100
   ],
   "r3": [
    460,
    100
   ],
   "r1": [
    130,
    270
   ],
   "r2": [
    460,
    270
   ],
   "e0": [
    550,
    45
   ]
  }
 },
 "versions": [
  {
   "name": "Start",
   "blurb": "Before the AI's work: the verifier does not support OSPF areas yet. It treats the whole network as one area.",
   "rules": [
    {
     "id": 1,
     "text": "A path costs the sum of its link costs; broken links can't be used.",
     "change": "same"
    },
    {
     "id": 2,
     "text": "Each router takes the cheapest path, ignoring areas.",
     "change": "same",
     "wrong": "The verifier ignores areas and takes the cheapest path anywhere, while it should actually find the cheapest path inside each area."
    },
    {
     "id": 3,
     "text": "Any router can pass traffic from one area to another.",
     "change": "same",
     "wrong": "The verifier lets any router pass traffic between areas, while it should actually allow this only at routers linked to area 0."
    },
    {
     "id": 6,
     "text": "If no allowed path exists, the destination is unreachable.",
     "change": "same"
    }
   ],
   "reveal": {
    "round": 1,
    "proposals": 0,
    "excerpt": "-/// constrained to the shortest path over the up-links.\n+/// constrained to the area-aware OSPF route over the up-links.\n…\n+/// - **intra-area** candidates `da[a](s, t)` (t reachable within area a); and\n+/// - **inter-area** candidates `da[a_s](s, b1) + da[0](b1, b2) + da[a_t](b2, t)`\n+///   over backbone routers `b1, b2` and areas `a_s, a_t` — i.e. source-area to an\n+///   ABR, across the backbone, then down the destination area. Because `b1`/`b2`\n+///   must be backbone routers, a non-ABR can never relay non-backbone→non-backbone\n+///   traffic (the forbidden shortcut).\n…\n+/// OSPF prefers **intra-area over inter-area regardless of cost**: inter-area\n+/// candidates only constrain the cost when no intra-area candidate is reachable.",
    "explain": "The seed computed plain shortest paths over every link, as if the whole network were a single area. The agent added areas: a route may change area only at a border router, through the backbone (area 0), and a path inside an area always beats a cheaper path that leaves it. The starting test corpus already caught this; no Test Generator needed."
   },
   "missing": "The verifier always takes the cheapest path, while it should actually prefer a path that stays inside one area, even a costlier one."
  },
  {
   "name": "Midway",
   "blurb": "Midway through the run: it knows areas, but trusts any working area-0 link.",
   "rules": [
    {
     "id": 1,
     "text": "A path costs the sum of its link costs; broken links can't be used.",
     "change": "same"
    },
    {
     "id": 2,
     "text": "Inside an area, routers take the cheapest path within that area.",
     "change": "changed"
    },
    {
     "id": 3,
     "text": "Traffic changes area only through area 0, at routers with a working area-0 link.",
     "change": "changed"
    },
    {
     "id": 4,
     "text": "A path that stays inside one area beats any path between areas, even a cheaper one.",
     "change": "new"
    },
    {
     "id": 5,
     "text": "A destination with a working area-0 link must be reached through area 0.",
     "change": "new",
     "wrong": "The verifier trusts any working area-0 link, while it should actually use area 0 only if area 0 can reach the destination."
    },
    {
     "id": 6,
     "text": "If no allowed path exists, the destination is unreachable.",
     "change": "same"
    }
   ],
   "reveal": {
    "round": 5,
    "proposals": 8,
    "excerpt": "-            Some(self.backbone_live(t))\n…\n+                        // only happens when `t` is NOT reachable as a plain backbone\n+                        // destination from `b1`'s backbone component: if `da[0](b1,\n+                        // t)` is valid, `t` is already in that backbone's LSDB and is\n+                        // reached intra-backbone (`a_t == 0`), never re-summarized —\n…\n+                        // supersedes a purely-local `backbone_live(t)` check, which\n+                        // conflates \"link up\" with \"reachable through the backbone\".\n+                        let dest_via_backbone = self.da[&0].get_cost(&self.sym(b1), &self.sym(t));\n+                        let descent_ok = dest_via_backbone.is_none();\n…\n-                                dest_not_bb_live = live.not();\n+                            conj.push(&descent_ok);",
    "explain": "Link up ≠ reachable. The mid-run version checked only that the destination had an area-0 link that was up, but here t's only backbone link leads to x, a piece of the backbone cut off from b1 and b2, so it wrongly ruled out the path into t through area 1 and declared t unreachable. The fix asks whether the destination is actually reachable through the backbone from the border router."
   }
  },
  {
   "name": "Final",
   "blurb": "End of the run: it checks that area 0 can actually reach the destination.",
   "rules": [
    {
     "id": 1,
     "text": "A path costs the sum of its link costs; broken links can't be used.",
     "change": "same"
    },
    {
     "id": 2,
     "text": "Inside an area, routers take the cheapest path within that area.",
     "change": "same"
    },
    {
     "id": 3,
     "text": "Traffic changes area only through area 0, at routers with a working area-0 link.",
     "change": "same"
    },
    {
     "id": 4,
     "text": "A path that stays inside one area beats any path between areas, even a cheaper one.",
     "change": "same"
    },
    {
     "id": 5,
     "text": "A destination is reached through area 0 only if area 0 can actually get there.",
     "change": "changed"
    },
    {
     "id": 6,
     "text": "If no allowed path exists, the destination is unreachable.",
     "change": "same"
    }
   ],
   "reveal": null
  }
 ],
 "twist": null,
 "bonus": "Two AI agents built OSPF rules that give the same answers. But on an 18-router network, one could not finish a check in 20 minutes while the other took 0.16 s. Asked to make its rules scale, the slow one fixed this in two rounds (0.4 s).",
 "endText": "The Final version agrees with bgpsim on every network here and on all 544 tests of the run. But passing every test is not a proof that it is right. When can we trust it? Come and argue with us at the poster.",
 "deciders": {
  "area_forced_backbone": {
   "no failures": [
    {
     "verifier": {
      "rule": 3,
      "because": "r4 may relay from area 1 to area 2: r0–r4–r3 costs 2, cheaper than r0–r1–r2–r3 at 3 → r4"
     },
     "oracle": {
      "because": "r4 is in areas 1 and 2 but not the backbone, so it cannot relay; r0–r1–r2–r3, cost 3 → r1"
     }
    },
    {
     "verifier": {
      "rule": 3,
      "because": "r4 has no area-0 link, so it cannot switch areas; go area 1, backbone r1–r2, area 2, cost 3 → r1"
     },
     "oracle": {
      "because": "r4 is in areas 1 and 2 but not the backbone, so it cannot relay; r0–r1–r2–r3, cost 3 → r1"
     }
    },
    {
     "verifier": {
      "rule": 3,
      "because": "r4 has no area-0 link, so it cannot switch areas; go area 1, backbone r1–r2, area 2, cost 3 → r1"
     },
     "oracle": {
      "because": "r4 is in areas 1 and 2 but not the backbone, so it cannot relay; r0–r1–r2–r3, cost 3 → r1"
     }
    }
   ],
   "fail (0, 4)": [
    {
     "verifier": {
      "rule": 2,
      "because": "with r0–r4 down, the cheapest remaining path is r0–r1–r2–r3, cost 3 → r1"
     },
     "oracle": {
      "because": "with r0–r4 down, the only path is through the backbone: r0–r1–r2–r3, cost 3 → r1"
     }
    },
    {
     "verifier": {
      "rule": 3,
      "because": "area 1, backbone r1–r2, then area 2: r0–r1–r2–r3, cost 3 → r1"
     },
     "oracle": {
      "because": "with r0–r4 down, the only path is through the backbone: r0–r1–r2–r3, cost 3 → r1"
     }
    },
    {
     "verifier": {
      "rule": 3,
      "because": "area 1, backbone r1–r2, then area 2: r0–r1–r2–r3, cost 3 → r1"
     },
     "oracle": {
      "because": "with r0–r4 down, the only path is through the backbone: r0–r1–r2–r3, cost 3 → r1"
     }
    }
   ]
  },
  "octr_08_backbone_partitioned_dest": {
   "no failures": [
    {
     "verifier": {
      "rule": 2,
      "because": "areas ignored: b1–b2–t–x, cost 3 → b2"
     },
     "oracle": {
      "because": "x lies in backbone piece {t, x}, cut off from b1's piece {b1, b2}; area 1 cannot bridge it → unreachable"
     }
    },
    {
     "verifier": {
      "rule": 5,
      "because": "t has area-0 link t–x up, so the last leg b2–t through area 1 is forbidden → unreachable"
     },
     "oracle": {
      "because": "b1 crosses the backbone to b2, then area 1 to t, cost 2 → b2"
     }
    },
    {
     "verifier": {
      "rule": 5,
      "because": "b1 cannot reach t over area 0 (backbone split), so b2–t via area 1 is allowed, cost 2 → b2"
     },
     "oracle": {
      "because": "b1 crosses the backbone to b2, then area 1 to t, cost 2 → b2"
     }
    }
   ],
   "fail (0, 1)": [
    {
     "verifier": {
      "rule": 2,
      "because": "s–b1 is not on the path; areas ignored: b1–b2–t–x, cost 3 → b2"
     },
     "oracle": {
      "because": "x lies in backbone piece {t, x}, cut off from b1's piece {b1, b2}; area 1 cannot bridge it → unreachable"
     }
    },
    {
     "verifier": {
      "rule": 5,
      "because": "t has area-0 link t–x up, so the last leg b2–t through area 1 is forbidden → unreachable"
     },
     "oracle": {
      "because": "s–b1 is not on the path; b1 crosses the backbone to b2, then area 1 to t, cost 2 → b2"
     }
    },
    {
     "verifier": {
      "rule": 5,
      "because": "b1 cannot reach t over area 0 (backbone split), so b2–t via area 1 is allowed, cost 2 → b2"
     },
     "oracle": {
      "because": "s–b1 is not on the path; b1 crosses the backbone to b2, then area 1 to t, cost 2 → b2"
     }
    }
   ],
   "fail (3, 4)": [
    {
     "verifier": {
      "rule": 6,
      "because": "with t–x down, x has no link left, so no path exists → unreachable"
     },
     "oracle": {
      "because": "with t–x down, x has no link left → unreachable"
     }
    },
    {
     "verifier": {
      "rule": 5,
      "because": "with t–x down, t has no area-0 link up, so b2–t via area 1 is allowed, cost 2 → b2"
     },
     "oracle": {
      "because": "b1 crosses the backbone to b2, then area 1 to t, cost 2 → b2"
     }
    },
    {
     "verifier": {
      "rule": 5,
      "because": "b1 cannot reach t over area 0, so b2–t via area 1 is allowed, cost 2 → b2"
     },
     "oracle": {
      "because": "b1 crosses the backbone to b2, then area 1 to t, cost 2 → b2"
     }
    }
   ]
  },
  "octr_03_discontiguous_area": {
   "no failures": [
    {
     "verifier": {
      "rule": 2,
      "because": "areas ignored: r0–r1–r2–r3, cost 3 → r1"
     },
     "oracle": {
      "because": "area 1's two islands join through backbone link r1–r2: r0–r1–r2–r3, cost 3 → r1"
     }
    },
    {
     "verifier": {
      "rule": 3,
      "because": "area 1 is split, so go area 1, backbone r1–r2, then area 1 again, cost 3 → r1"
     },
     "oracle": {
      "because": "area 1's two islands join through backbone link r1–r2: r0–r1–r2–r3, cost 3 → r1"
     }
    },
    {
     "verifier": {
      "rule": 3,
      "because": "area 1 is split, so go area 1, backbone r1–r2, then area 1 again, cost 3 → r1"
     },
     "oracle": {
      "because": "area 1's two islands join through backbone link r1–r2: r0–r1–r2–r3, cost 3 → r1"
     }
    }
   ],
   "fail (1, 2)": [
    {
     "verifier": {
      "rule": 6,
      "because": "with r1–r2 down, no link joins {r0, r1} to {r2, r3} → unreachable"
     },
     "oracle": {
      "because": "with r1–r2 down, no link joins {r0, r1} to {r2, r3} → unreachable"
     }
    },
    {
     "verifier": {
      "rule": 6,
      "because": "with r1–r2 down, no link joins {r0, r1} to {r2, r3} → unreachable"
     },
     "oracle": {
      "because": "with r1–r2 down, no link joins {r0, r1} to {r2, r3} → unreachable"
     }
    },
    {
     "verifier": {
      "rule": 6,
      "because": "with r1–r2 down, no link joins {r0, r1} to {r2, r3} → unreachable"
     },
     "oracle": {
      "because": "with r1–r2 down, no link joins {r0, r1} to {r2, r3} → unreachable"
     }
    }
   ]
  },
  "square": {
   "no failures": [
    {
     "verifier": {
      "rule": 2,
      "because": "the direct link r1–r0, cost 1, is the cheapest path → r0"
     },
     "oracle": {
      "because": "all links are backbone; the direct link r1–r0, cost 1, is cheapest → r0"
     }
    },
    {
     "verifier": {
      "rule": 2,
      "because": "all links are in area 0; the direct link r1–r0, cost 1, is cheapest → r0"
     },
     "oracle": {
      "because": "all links are backbone; the direct link r1–r0, cost 1, is cheapest → r0"
     }
    },
    {
     "verifier": {
      "rule": 2,
      "because": "all links are in area 0; the direct link r1–r0, cost 1, is cheapest → r0"
     },
     "oracle": {
      "because": "all links are backbone; the direct link r1–r0, cost 1, is cheapest → r0"
     }
    }
   ],
   "fail (0, 1)": [
    {
     "verifier": {
      "rule": 2,
      "because": "with r0–r1 down, the only path is r1–r2–r3–r0, cost 3 → r2"
     },
     "oracle": {
      "because": "with r0–r1 down, the only path is r1–r2–r3–r0, cost 3 → r2"
     }
    },
    {
     "verifier": {
      "rule": 2,
      "because": "with r0–r1 down, the only path is r1–r2–r3–r0, cost 3 → r2"
     },
     "oracle": {
      "because": "with r0–r1 down, the only path is r1–r2–r3–r0, cost 3 → r2"
     }
    },
    {
     "verifier": {
      "rule": 2,
      "because": "with r0–r1 down, the only path is r1–r2–r3–r0, cost 3 → r2"
     },
     "oracle": {
      "because": "with r0–r1 down, the only path is r1–r2–r3–r0, cost 3 → r2"
     }
    }
   ]
  },
  "octr_04_intra_beats_cheaper_backbone": {
   "no failures": [
    {
     "verifier": {
      "rule": 2,
      "because": "areas ignored: r0–r1–r2–r3 costs 3, cheaper than r0–r4–r3 at 10 → r1"
     },
     "oracle": {
      "because": "r0 and r3 share area 1; the intra-area path r0–r4–r3 (10) beats the backbone path (3) → r4"
     }
    },
    {
     "verifier": {
      "rule": 4,
      "because": "r0 and r3 share area 1; intra-area r0–r4–r3 (10) beats the backbone path (3) → r4"
     },
     "oracle": {
      "because": "r0 and r3 share area 1; the intra-area path r0–r4–r3 (10) beats the backbone path (3) → r4"
     }
    },
    {
     "verifier": {
      "rule": 4,
      "because": "r0 and r3 share area 1; intra-area r0–r4–r3 (10) beats the backbone path (3) → r4"
     },
     "oracle": {
      "because": "r0 and r3 share area 1; the intra-area path r0–r4–r3 (10) beats the backbone path (3) → r4"
     }
    }
   ],
   "fail (0, 1)": [
    {
     "verifier": {
      "rule": 2,
      "because": "with r0–r4 down, the cheapest path is r0–r1–r2–r3, cost 3 → r1"
     },
     "oracle": {
      "because": "with r0–r4 down, no area-1 path is left; via backbone r1–r2, cost 3 → r1"
     }
    },
    {
     "verifier": {
      "rule": 3,
      "because": "with r0–r4 down, no area-1 path is left; go via backbone r1–r2, cost 3 → r1"
     },
     "oracle": {
      "because": "with r0–r4 down, no area-1 path is left; via backbone r1–r2, cost 3 → r1"
     }
    },
    {
     "verifier": {
      "rule": 3,
      "because": "with r0–r4 down, no area-1 path is left; go via backbone r1–r2, cost 3 → r1"
     },
     "oracle": {
      "because": "with r0–r4 down, no area-1 path is left; via backbone r1–r2, cost 3 → r1"
     }
    }
   ]
  }
 },
 "mistakes": {
  "area_forced_backbone": {
   "no failures": {
    "0": {
     "rule": 3,
     "tags": {
      "r4": "no area-0 link"
     },
     "why": "It sends traffic through r4, straight from area 1 into area 2: cost 2.",
     "reference": "r4 has no area-0 link, so it cannot pass traffic between areas. The path goes through area 0: r0–r1–r2–r3, cost 3."
    }
   }
  },
  "octr_08_backbone_partitioned_dest": {
   "no failures": {
    "0": {
     "rule": 2,
     "why": "Ignoring areas, it finds b1–b2–t–x, cost 3.",
     "reference": "x is in the piece of area 0 cut off from b1. Area 1 cannot join two pieces of area 0, so x is unreachable."
    },
    "1": {
     "rule": 5,
     "why": "t has a working area-0 link (to x), so it insists on reaching t through area 0, finds no way, and gives up.",
     "reference": "that area-0 link only leads to x, which is cut off from b1, so it uses area 1: b1–b2–t, cost 2."
    }
   },
   "fail (0, 1)": {
    "0": {
     "rule": 2,
     "why": "Ignoring areas, it finds b1–b2–t–x, cost 3. The broken s–b1 link plays no part.",
     "reference": "x is in the piece of area 0 cut off from b1. Area 1 cannot join two pieces of area 0, so x is unreachable."
    },
    "1": {
     "rule": 5,
     "why": "t has a working area-0 link (to x), so it insists on reaching t through area 0, finds no way, and gives up.",
     "reference": "that area-0 link only leads to x, which is cut off from b1, so it uses area 1: b1–b2–t, cost 2."
    }
   }
  },
  "octr_04_intra_beats_cheaper_backbone": {
   "no failures": {
    "0": {
     "rule": 2,
     "why": "Ignoring areas, the cheapest path is r0–r1–r2–r3, cost 3.",
     "reference": "r0 and r3 share area 1, and a path inside one area always wins: r0–r4–r3, cost 10."
    }
   }
  }
 },
 "cards": {
  "area_forced_backbone": {
   "title": "A shortcut that skips area 0",
   "blurb": "r4 links area 1 and area 2, but has no link to area 0."
  },
  "octr_08_backbone_partitioned_dest": {
   "title": "Area 0 split in two",
   "blurb": "Area 0 is in two pieces, b1–b2 and t–x. t also reaches b2 through area 1."
  },
  "octr_03_discontiguous_area": {
   "title": "Area 1 split in two",
   "blurb": "Area 1 is in two pieces, joined only by the area-0 link r1–r2."
  },
  "square": {
   "title": "Four routers in a ring",
   "blurb": "All four links are in area 0 and cost 1."
  },
  "octr_04_intra_beats_cheaper_backbone": {
   "title": "Stay inside, or go through area 0?",
   "blurb": "r0 and r3 share area 1 through a path of cost 10; through area 0 it costs only 3."
  }
 },
 "realName": "Real OSPF",
 "howto": [
  [
   "Paths",
   "traffic follows links from router to router. Every link costs 1 unless a number is shown; a path costs the sum, and the cheapest path wins."
  ],
  [
   "Areas",
   "each area is a shaded region with its own border, and its links share its colour; a router on the border between two regions is in both. Traffic that moves between areas must pass through area 0, the central one (blue)."
  ],
  [
   "Reference",
   "bgpsim, a network simulator that follows OSPF. Where the rules say “Real OSPF”, bgpsim behaves the same way."
  ],
  [
   "Gold and pink arrows",
   "the first step from the router in the question (dashed ring) toward its destination, according to bgpsim (gold) and to the verifier (pink)."
  ]
 ]
};
