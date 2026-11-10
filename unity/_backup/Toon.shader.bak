Shader "Yue/Toon"
{
    Properties
    {
        _Color ("Base", Color) = (0.9,0.9,0.9,1)
        _ShadeColor ("Shade", Color) = (0.42,0.40,0.50,1)
        _RimColor ("Rim", Color) = (1,0.98,0.95,1)
        _RimPower ("Rim Power", Range(0.5,8)) = 3.0
        _RimStrength ("Rim Strength", Range(0,2)) = 0.55
        _OutlineColor ("Outline", Color) = (0.06,0.05,0.08,1)
        _Outline ("Outline Width", Range(0,0.06)) = 0.012
        _Steps ("Shade Steps", Range(1,6)) = 2
        _Bands ("Bands", Range(0,24)) = 0
        _BandTint ("Band Tint", Color) = (0.72,0.70,0.78,1)
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        Pass // 描边：反面外扩
        {
            Name "OUTLINE"
            Cull Front
            ZWrite On
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            float _Outline;
            fixed4 _OutlineColor;
            struct appdata { float4 vertex : POSITION; float3 normal : NORMAL; };
            struct v2f { float4 pos : SV_POSITION; };
            v2f vert(appdata v)
            {
                v2f o;
                float3 n = normalize(v.normal);
                float4 clip = UnityObjectToClipPos(v.vertex);
                float3 vn = mul((float3x3)UNITY_MATRIX_IT_MV, n);
                float2 proj = normalize(vn.xy);
                o.pos = clip;
                o.pos.xy += proj * _Outline * clip.w * 0.02;
                return o;
            }
            fixed4 frag(v2f i) : SV_Target { return _OutlineColor; }
            ENDCG
        }

        Pass // 本体：硬边二分 + 边缘光
        {
            Name "TOON"
            Tags { "LightMode"="ForwardBase" }
            Cull Back
            ZWrite On
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            struct appdata { float4 vertex : POSITION; float3 normal : NORMAL; };
            struct v2f { float4 pos : SV_POSITION; float3 n : TEXCOORD0; float3 v : TEXCOORD1; float3 op : TEXCOORD2; };
            fixed4 _Color, _ShadeColor, _RimColor;
            float _RimPower, _RimStrength, _Steps, _Bands;
            fixed4 _BandTint;

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.n = UnityObjectToWorldNormal(v.normal);
                o.v = WorldSpaceViewDir(v.vertex);
                o.op = v.vertex.xyz;
                return o;
            }
            fixed4 frag(v2f i) : SV_Target
            {
                float3 n = normalize(i.n);
                float3 v = normalize(i.v);
                float3 l = normalize(_WorldSpaceLightPos0.xyz);
                float ndl = dot(n, l) * 0.5 + 0.5;

                // 量化成几档，硬边
                float s = floor(ndl * _Steps) / _Steps;
                fixed3 col = lerp(_ShadeColor.rgb, _Color.rgb, s);

                // 菲涅尔暖边，三渲二常见的"描边光"
                float fres = pow(1.0 - saturate(dot(n, v)), _RimPower);
                // 程序化条带：三渲二里用硬边色块分带，不靠贴图
                if (_Bands > 0.01)
                {
                    float b = frac(i.op.y * _Bands * 0.5 + sin(i.op.x * 1.7 + i.op.z * 2.1) * 0.11 + sin(i.op.y * 0.9) * 0.05);
                    float band = step(0.46 + 0.12 * sin(i.op.z * 3.0), b);
                    col = lerp(col, col * _BandTint.rgb, band * 0.55);
                }
                col += _RimColor.rgb * fres * _RimStrength;

                return fixed4(col, 1);
            }
            ENDCG
        }
    }
    Fallback Off
}
