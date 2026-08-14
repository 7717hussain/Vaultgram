import asyncio
import json
import os
import re
import sys
from telethon import TelegramClient

API_ID = int(os.environ.get("TG_API_ID", "0"))
API_HASH = os.environ.get("TG_API_HASH", "")
SESSION_NAME = os.environ.get("TG_SESSION_NAME", "tg_user_session")
OUTPUT_JSON = os.environ.get("OUTPUT_JSON", os.path.join(os.path.dirname(__file__), "..", "public", "catalog.json"))

if not API_ID or not API_HASH:
    print("Error: Please set TG_API_ID and TG_API_HASH environment variables.")
    sys.exit(1)

VAULTS = [
    {"id": "fastlane", "name": "FASTLANE", "tg_title": "FASTLANE"},
    {"id": "pratham_11th", "name": "PRATHAM (11th)", "tg_title": "PRATHAM/11TH"},
    {"id": "prakhar_12th", "name": "PRAKHAR (12th)", "tg_title": "PRAKHAR/12TH"}
]

# Chapter classification with subjects
SUBJECT_CHAPTERS = {
    "Physics": [
        ("Rectilinear Motion", ["rectilinear motion", "rectilinear"]),
        ("Projectile Motion", ["projectile motion", "projectile"]),
        ("Relative Motion", ["relative motion"]),
        ("Kinematics", ["kinematics"]),
        ("Geometrical Optics", ["geometrical optics", "ray optics", "optics", r"\bgo\b", r"\bgo-\d", r"\bgo_\d"]),
        ("Wave Optics", ["wave optics"]),
        ("Laws of Motion", ["laws of motion", "newtons laws", r"\bnlm\b"]),
        ("Friction", ["friction"]),
        ("Work Power Energy", ["work power energy", r"\bwpe\b", "work power & energy"]),
        ("Circular Motion", ["circular motion"]),
        ("Center of Mass", ["center of mass", "centre of mass", r"\bcom\b"]),
        ("Rotational Dynamics", ["rotational dynamics", "rotational motion", r"\brbd\b", "rigid body"]),
        ("Gravitation", ["gravitation"]),
        ("Electrostatics", ["electrostatics", "electrostatic", r"\belectro\b"]),
        ("Capacitance", ["capacitance", "capacitor", "capacitors"]),
        ("Current Electricity", ["current electricity", "current"]),
        ("EMF & Magnetism", [r"\bemf\b", "magnetic effect", "magnetism"]),
        ("EMI", [r"\bemi\b", "electromagnetic induction"]),
        ("Alternating Current", ["alternating current", r"\bac\b", r"\bac-\d", r"\bac_"]),
        ("EMW", [r"\bemw\b", "electromagnetic waves"]),
        ("Modern Physics", ["modern physics", "photoelectric", "bohr"]),
        ("Nuclear Physics", ["nuclear physics", "radioactivity"]),
        ("Semiconductor", ["semiconductor", "semiconductors", "electronic devices"]),
        ("Communication System", ["communication system", "poc"]),
        ("Fluid Mechanics", ["fluid mechanics", "fluids", "fluid"]),
        ("Elasticity & Viscosity", ["elasticity", "viscosity"]),
        ("Surface Tension", ["surface tension"]),
        ("Calorimetry", ["calorimetry"]),
        ("Thermal Expansion", ["thermal expansion"]),
        ("KTG & Thermodynamics", ["ktg", "thermodynamics"]),
        ("SHM", [r"\bshm\b", "simple harmonic"]),
        ("Wave on String", ["wave on string"]),
        ("Sound Waves", ["sound wave", "sound waves"]),
        ("Error & Measurement", ["error", "measurement", "unit and dimension", "unit & dimension"])
    ],
    "Maths": [
        ("Fundamental of Mathematics", ["fundamental of mathematics", r"\bfom\b", "sets"]),
        ("Quadratic Equations", ["quadratic equation", "quadratic equations", "quadratic"]),
        ("Sequence & Series", ["sequence & series", "sequence and series", "progression"]),
        ("Trigonometry", ["trigonometry", "trig"]),
        ("Solution of Triangle", ["solution of triangle", r"\bsot\b"]),
        ("Inverse Trigonometric Functions", ["inverse trigonometric", r"\bitf\b"]),
        ("Determinants", ["determinants", "determinant"]),
        ("Matrices", ["matrices", "matrix"]),
        ("Straight Line", ["straight line", "straight lines"]),
        ("Circle", ["circle", "circles"]),
        ("Parabola", ["parabola"]),
        ("Ellipse", ["ellipse"]),
        ("Hyperbola", ["hyperbola"]),
        ("Conic Sections", ["conic section", "conics"]),
        ("Relation & Function", ["relation & function", "relation and function", "relation", "function", "functions"]),
        ("Limits Continuity Differentiability", ["continuity", "differentiability", "limits", "limit", "lcd"]),
        ("Method of Differentiation", ["method of differentiation", r"\bmod\b"]),
        ("Application of Derivatives", ["application of derivatives", "applications of derivatives", r"\baod\b"]),
        ("Indefinite Integration", ["indefinite integration", "indefinite"]),
        ("Definite Integration", ["definite integration", "definite"]),
        ("Area Under Curves", [r"\barea\b"]),
        ("Differential Equations", ["differential equation", "differential equations"]),
        ("Vector & 3D", ["vector & 3d", "vector and 3d", "vector", "3d"]),
        ("Complex Numbers", ["complex number", "complex numbers", "complex"]),
        ("Binomial Theorem", ["binomial theorem", "binomial"]),
        ("Permutation & Combination", ["permutation and combination", "permutation & combination", "permutation", "p&c", r"\bpnc\b"]),
        ("Probability", ["probability"]),
        ("Statistics", ["statistics"]),
        ("Mathematical Reasoning", ["mathematical reasoning"])
    ],
    "Chemistry": [
        ("Stereoisomerism", ["stereoisomerism"]),
        ("ORM 1", ["orm 1", "orm-1", "orm1"]),
        ("ORM 2", ["orm 2", "orm-2", "orm2"]),
        ("ORM 3", ["orm 3", "orm-3", "orm3"]),
        ("ORM 4", ["orm 4", "orm-4", "orm4"]),
        ("Reduction Oxidation & Hydrolysis", ["reduction oxidation", "hydrolysis"]),
        ("Aromatic Compounds", ["aromatic"]),
        ("Aldehydes Ketones & Carboxylic Acids", ["aldehyde", "ketone", "carboxylic"]),
        ("Biomolecules", ["biomolecule", "biomolecules"]),
        ("Polymers", ["polymer", "polymers"]),
        ("Chemistry in Everyday Life", ["chemistry in everyday life"]),
        ("Chemical Kinetics", ["chemical kinetics"]),
        ("Surface Chemistry", ["surface chemistry"]),
        ("Qualitative Analysis", ["qualatitive analysis", "qualitative analysis"]),
        ("d and f Block Elements", ["d and f block", "d & f block"]),
        ("Coordination Compounds", ["coordination", "co-ordination"]),
        ("Periodic Table", ["periodic", "periodicity"]),
        ("Chemical Bonding", ["chemical bonding", "bonding"]),
        ("Gaseous State", ["gaseous state", "ideal gas"]),
        ("Atomic Structure", ["atomic structure", "quantum"]),
        ("Chemical Equilibrium", ["chemical equilibrium"]),
        ("Ionic Equilibrium", ["ionic equilibrium", "ionic eq"]),
        ("Thermodynamics (Chem)", ["thermo"]),
        ("Redox Reactions", ["redox"]),
        ("Electrochemistry", ["electrochemistry"]),
        ("Solid State", ["solid state"]),
        ("Solutions", ["solutions", "liquid solution"]),
        ("p Block Elements", ["p block", "p-block"]),
        ("s Block & Hydrogen", ["s block", "hydrogen"]),
        ("Metallurgy", ["metallurgy", "ores"])
    ]
}

def classify(filename, caption=""):
    text = (filename + " " + caption).lower()
    for subj, chaps in SUBJECT_CHAPTERS.items():
        for ch_name, patterns in chaps:
            for p in patterns:
                if re.search(p, text, re.IGNORECASE):
                    return subj, ch_name
    return "Other", "General Lectures"

async def generate():
    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    print("Connecting to Telegram...")
    client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
    await client.connect()

    if not await client.is_user_authorized():
        print("Telegram session not authorized!")
        return

    dialogs = await client.get_dialogs()
    channel_map = {d.title: d for d in dialogs if d.is_channel}

    catalog = {
        "version": 2,
        "generatedAt": "",
        "batches": []
    }

    for vault in VAULTS:
        v_title = vault["tg_title"]
        if v_title not in channel_map:
            print(f"Skipping {v_title}, not found in dialogs")
            continue

        chan_dialog = channel_map[v_title]
        chan_entity = chan_dialog.entity
        chan_id = getattr(chan_entity, 'id', None)

        print(f"Scanning channel for video lectures: {v_title} (ID: {chan_id})...")
        messages = await client.get_messages(chan_entity, limit=None)
        
        # Filter ONLY video lectures (video attribute or .mp4/.mkv document)
        media_msgs = [
            m for m in messages 
            if m.media and (
                m.video or 
                (m.document and (
                    "video" in getattr(m.file, 'mime_type', '') or 
                    getattr(m.file, 'name', '').lower().endswith(('.mp4', '.mkv', '.mov', '.webm'))
                ))
            )
        ]
        media_msgs.reverse()

        subjects_dict = {}

        for idx, msg in enumerate(media_msgs, start=1):
            fname = getattr(msg.file, 'name', None)
            caption = msg.message or ""
            mime = getattr(msg.file, 'mime_type', 'video/mp4')
            size = getattr(msg.file, 'size', 0)
            dur = None

            if msg.video:
                dur = getattr(msg.video, 'duration', None)
                if not fname:
                    fname = f"{idx:03d}_Lecture_{msg.id}.mp4"
            else:
                if not fname:
                    fname = f"{idx:03d}_Lecture_{msg.id}.mp4"

            clean_fname = "".join(c for c in fname if c.isalnum() or c in " ._-()[]")
            subj, chap = classify(clean_fname, caption)

            if subj not in subjects_dict:
                subjects_dict[subj] = {}
            if chap not in subjects_dict[subj]:
                subjects_dict[subj][chap] = {"lectures": []}

            item_entry = {
                "id": f"{vault['id']}-{msg.id}",
                "title": clean_fname,
                "messageId": msg.id,
                "channelId": chan_id,
                "fileName": clean_fname,
                "fileSize": size,
                "mimeType": "video/mp4",
                "duration": dur,
                "caption": caption[:100] if caption else "",
                "order": idx
            }

            subjects_dict[subj][chap]["lectures"].append(item_entry)

        # Convert to nested array structure
        subj_list = []
        for subj_name, chaps in subjects_dict.items():
            ch_list = []
            for ch_name, data in chaps.items():
                if len(data["lectures"]) > 0:
                    ch_list.append({
                        "id": re.sub(r'[^a-zA-Z0-9]', '_', ch_name.lower()),
                        "name": ch_name,
                        "lectures": data["lectures"],
                        "lectureCount": len(data["lectures"])
                    })
            ch_list.sort(key=lambda x: x["name"])
            if len(ch_list) > 0:
                subj_list.append({
                    "id": re.sub(r'[^a-zA-Z0-9]', '_', subj_name.lower()),
                    "name": subj_name,
                    "chapters": ch_list
                })

        order = {"Physics": 1, "Chemistry": 2, "Maths": 3, "Other": 4}
        subj_list.sort(key=lambda s: order.get(s["name"], 99))

        catalog["batches"].append({
            "id": vault["id"],
            "name": vault["name"],
            "channelId": chan_id,
            "totalLectures": len(media_msgs),
            "subjects": subj_list
        })

    import datetime
    catalog["generatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2)

    print(f"Catalog successfully generated with {len(catalog['batches'])} batches to {OUTPUT_JSON}!")

if __name__ == "__main__":
    asyncio.run(generate())
