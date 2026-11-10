using System.IO;
using System.Text;
using System.Collections.Generic;
using UnityEngine;

// 经营面板的数值都写在这里，方便整体替换。目前这些数是我临时定的，待 Ollie 定稿。
public static class Mgmt
{
    public const int ApprenticeCost = 80;    // 徒弟：今天 +1 时辰
    public const int MakeupCost = 150;       // 化妆师：每单收入 +10%
    public const int EmceeCost = 120;        // 司仪：每单收尸怨气 -3
    public const int IncenseCost = 60;       // 香烛：一个，管一单，怨气 -2
    public const int ClothCost = 200;        // 寿衣料：一个，穿衣不花时辰
    public const int BribeCost = 200;        // 打点：热度 -15
    public const int BribeHeatGate = 30;     // 热度到这个数才需要打点
}
