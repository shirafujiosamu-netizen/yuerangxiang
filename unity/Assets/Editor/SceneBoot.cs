#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;

/// <summary>
/// 首次打开工程时自动建出 Assets/Scenes/Main.unity 并进一次 Play，
/// 让作者立刻看见画面；之后每次打开只负责把场景摆到眼前，不再强制播放。
/// </summary>
[InitializeOnLoad]
public static class SceneBoot
{
    const string ScenePath = "Assets/Scenes/Main.unity";
    const string PlayedKey = "yueliangxiang.autoplay";

    static SceneBoot()
    {
        EditorApplication.delayCall += Run;
    }

    static double _armedAt;

    static void AutoPlayTick()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode) { EditorApplication.update -= AutoPlayTick; return; }
        if (_armedAt < 1) _armedAt = EditorApplication.timeSinceStartup;
        if (EditorApplication.timeSinceStartup - _armedAt < 6.0) return;
        EditorApplication.update -= AutoPlayTick;
        EditorApplication.isPlaying = true;
    }

    static void Run()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode) return;

        if (!File.Exists(ScenePath))
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            Directory.CreateDirectory("Assets/Scenes");
            EditorSceneManager.SaveScene(scene, ScenePath);
        }

        if (EditorSceneManager.GetActiveScene().path != ScenePath)
            EditorSceneManager.OpenScene(ScenePath);

        // .autoplay 存在时，等资源就绪后自动进 Play（供截图与演示）
        if (File.Exists("Assets/.autoplay"))
            EditorApplication.update += AutoPlayTick;
    }
}
#endif
