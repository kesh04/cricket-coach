"""
Feature extraction for the trained position classifier.

THIS FILE HAS A TWIN: src/lib/pose/features.ts in the app. The model is trained on the features
computed here and judged in the app on the features computed there, so the two must give the
same numbers for the same frame. Change both together.

The body is described in a "batter frame" that does not depend on where the phone is, how far
away the learner stands, body size or batting hand: left/right landmarks are swapped for a
left-hander (so the "L" slots are always the front side), the origin is the middle of the hips,
lengths are divided by the trunk length, and the body is turned about the vertical so that +x
points towards the bowler (a left-hander is also mirrored).

Output: 99 normalised coordinates + 32 body measures + 7 picture measures = 138 numbers.
"""
import math

FEATURE_VERSION = 1

PAIRS = [(1, 4), (2, 5), (3, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16), (17, 18), (19, 20),
         (21, 22), (23, 24), (25, 26), (27, 28), (29, 30), (31, 32)]

NOSE, L_EAR, R_EAR, L_SH, R_SH, L_EL, R_EL, L_WR, R_WR, L_IDX, R_IDX = 0, 7, 8, 11, 12, 13, 14, 15, 16, 19, 20
L_HIP, R_HIP, L_KN, R_KN, L_AN, R_AN, L_HEEL, R_HEEL, L_TOE, R_TOE = 23, 24, 25, 26, 27, 28, 29, 30, 31, 32
DEG = 180 / math.pi

COORD_NAMES = [f"c{i}_{a}" for i in range(33) for a in "xyz"]
BODY_NAMES = [
    "front_knee", "back_knee", "front_hip", "back_hip", "front_elbow", "back_elbow", "front_armpit", "back_armpit",
    "trunk_lean", "trunk_lean_fwd", "shoulder_tilt", "feet_dist", "feet_along", "feet_across", "knee_dist", "hip_height",
    "hands_height", "hands_fwd", "hands_out", "hands_gap", "hands_to_front_knee", "head_height", "head_fwd", "head_over_front_foot",
    "neck", "look", "front_elbow_over_wrist", "front_elbow_over_shoulder", "shoulder_width", "hip_width", "front_toe_dir", "back_toe_dir",
]
PICTURE_NAMES = ["pic_hands_in", "pic_front_ankle_drop", "pic_feet_x", "pic_shoulder_spread", "pic_hip_spread", "pic_hands_y", "pic_nose_x"]
FEATURE_NAMES = COORD_NAMES + BODY_NAMES + PICTURE_NAMES
FEATURE_COUNT = len(FEATURE_NAMES)  # 138


def _slot_map(hand):
    m = list(range(33))
    if hand == "left":
        for a, b in PAIRS:
            m[a], m[b] = b, a
    return m


def _sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def _mid(a, b): return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
def _dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def _norm(a): return math.sqrt(_dot(a, a))


def _angle_between(a, b):
    d = _norm(a) * _norm(b)
    if d < 1e-9:
        return 0.0
    return math.acos(min(1.0, max(-1.0, _dot(a, b) / d))) * DEG


def _joint_angle(a, b, c): return _angle_between(_sub(a, b), _sub(c, b))


def extract_features(world, lm, hand="right", aspect=None):
    """world: 99 numbers (x, y, z per landmark, metres). lm: 132 numbers (x, y, z, visibility).
    hand: 'right' or 'left'. aspect: picture width / height."""
    m = _slot_map(hand)

    def raw(i):
        j = m[i]
        return (world[j * 3], world[j * 3 + 1], world[j * 3 + 2])

    origin = _mid(raw(L_HIP), raw(R_HIP))
    ax = raw(L_SH)[0] - raw(R_SH)[0] + raw(L_HIP)[0] - raw(R_HIP)[0]
    az = raw(L_SH)[2] - raw(R_SH)[2] + raw(L_HIP)[2] - raw(R_HIP)[2]
    al = math.hypot(ax, az)
    if al < 1e-9:
        ax, az = 1.0, 0.0
    else:
        ax, az = ax / al, az / al
    trunk = max(_norm(_sub(_mid(raw(L_SH), raw(R_SH)), origin)), 0.1)
    mirror = -1 if hand == "left" else 1
    C = []
    for i in range(33):
        v = _sub(raw(i), origin)
        x = v[0] * ax + v[2] * az
        z = -v[0] * az + v[2] * ax
        C.append((x / trunk, v[1] / trunk, (mirror * z) / trunk))

    out = []
    for c in C:
        out.extend(c)

    sh_mid = _mid(C[L_SH], C[R_SH])
    hip_mid = _mid(C[L_HIP], C[R_HIP])
    ank_mid = _mid(C[L_AN], C[R_AN])
    wr_mid = _mid(C[L_WR], C[R_WR])
    trunk_v = _sub(sh_mid, hip_mid)
    sh = _sub(C[L_SH], C[R_SH])
    head = _sub(C[NOSE], _mid(C[L_EAR], C[R_EAR]))
    head_flat = math.hypot(head[0], head[2])

    def toe_dir(heel, toe):
        d = _sub(C[toe], C[heel])
        return 90.0 if math.hypot(d[0], d[2]) < 1e-9 else math.atan2(abs(d[2]), d[0]) * DEG

    out += [
        _joint_angle(C[L_HIP], C[L_KN], C[L_AN]),
        _joint_angle(C[R_HIP], C[R_KN], C[R_AN]),
        _joint_angle(C[L_SH], C[L_HIP], C[L_KN]),
        _joint_angle(C[R_SH], C[R_HIP], C[R_KN]),
        _joint_angle(C[L_SH], C[L_EL], C[L_WR]),
        _joint_angle(C[R_SH], C[R_EL], C[R_WR]),
        _joint_angle(C[L_HIP], C[L_SH], C[L_EL]),
        _joint_angle(C[R_HIP], C[R_SH], C[R_EL]),
        _angle_between(trunk_v, (0, -1, 0)),
        math.atan2(trunk_v[0], -trunk_v[1]) * DEG,
        math.atan2(abs(sh[1]), math.hypot(sh[0], sh[2])) * DEG,
        _norm(_sub(C[L_AN], C[R_AN])),
        C[L_AN][0] - C[R_AN][0],
        C[L_AN][2] - C[R_AN][2],
        _norm(_sub(C[L_KN], C[R_KN])),
        ank_mid[1] - hip_mid[1],
        hip_mid[1] - wr_mid[1],
        wr_mid[0] - hip_mid[0],
        wr_mid[2] - hip_mid[2],
        _norm(_sub(C[L_WR], C[R_WR])),
        math.hypot(wr_mid[0] - C[L_KN][0], wr_mid[2] - C[L_KN][2]),
        hip_mid[1] - C[NOSE][1],
        C[NOSE][0] - ank_mid[0],
        C[NOSE][0] - C[L_AN][0],
        0.0 if head_flat + abs(head[1]) < 1e-9 else math.atan2(-head[1], head_flat) * DEG,
        90.0 if head_flat < 1e-9 else math.atan2(abs(head[2]), head[0]) * DEG,
        C[L_WR][1] - C[L_EL][1],
        C[L_SH][1] - C[L_EL][1],
        _norm(sh),
        _norm(_sub(C[L_HIP], C[R_HIP])),
        toe_dir(L_HEEL, L_TOE),
        toe_dir(R_HEEL, R_TOE),
    ]

    ar = aspect if aspect and aspect > 0 else 0.75

    def q(i):
        j = m[i]
        return (lm[j * 4] * ar, lm[j * 4 + 1])

    dir_x = q(L_SH)[0] + q(L_HIP)[0] - q(R_SH)[0] - q(R_HIP)[0]
    sgn = -1 if dir_x < 0 else 1
    def m2(a, b): return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    def d2(a, b): return math.hypot(a[0] - b[0], a[1] - b[1])
    p_sh = m2(q(L_SH), q(R_SH))
    p_hip = m2(q(L_HIP), q(R_HIP))
    p_ank = m2(q(L_AN), q(R_AN))
    p_wr = m2(q(L_WR), q(R_WR))
    tp = max(d2(p_sh, p_hip), 0.01)
    hand_x = (q(L_WR)[0] + q(R_WR)[0] + q(L_IDX)[0] + q(R_IDX)[0]) / 4
    out += [
        min(abs(hand_x - p_hip[0]), abs(hand_x - p_sh[0])) / tp,
        (q(L_AN)[1] - q(R_AN)[1]) / tp,
        (sgn * (q(L_AN)[0] - q(R_AN)[0])) / tp,
        d2(q(L_SH), q(R_SH)) / tp,
        d2(q(L_HIP), q(R_HIP)) / tp,
        (p_wr[1] - p_hip[1]) / tp,
        (sgn * (q(NOSE)[0] - p_ank[0])) / tp,
    ]
    return out
