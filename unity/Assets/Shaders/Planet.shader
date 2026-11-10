Shader "Moonlight/Planet"
{
    Properties
    {
        _MainTex ("Albedo", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,1)
        _RimColor ("Rim Color", Color) = (0.62,0.78,1,1)
        _RimPower ("Rim Power", Range(1, 8)) = 3.2
        _RimStrength ("Rim Strength", Range(0, 2)) = 0.9
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" }
        LOD 200

        CGPROGRAM
        #pragma surface surf Lambert
        #pragma target 3.0

        sampler2D _MainTex;
        fixed4 _Color;
        fixed4 _RimColor;
        half _RimPower;
        half _RimStrength;

        struct Input
        {
            float2 uv_MainTex;
            float3 viewDir;
            float3 worldNormal;
        };

        void surf (Input IN, inout SurfaceOutput o)
        {
            fixed4 c = tex2D(_MainTex, IN.uv_MainTex) * _Color;
            o.Albedo = c.rgb;

            float3 v = normalize(IN.viewDir);
            float3 n = normalize(IN.worldNormal);
            float rim = 1.0 - saturate(dot(v, n));
            o.Emission = _RimColor.rgb * pow(rim, _RimPower) * _RimStrength;
            o.Alpha = 1.0;
        }
        ENDCG
    }
    FallBack "Diffuse"
}
